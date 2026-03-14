document.addEventListener("DOMContentLoaded", () => {
  const monthLabel = document.getElementById("month-label");
  const calendarGrid = document.getElementById("calendar-grid");
  const prevBtn = document.getElementById("prev-month");
  const nextBtn = document.getElementById("next-month");
  const monthToggle = document.getElementById("month-toggle");
  const monthDropdown = document.getElementById("month-dropdown");
  const monthList = document.getElementById("month-list");
  const appointmentList = document.getElementById("appointment-list");
  const selectedDateLabel = document.getElementById("selected-date-label");

  const calendarUrl = "/api/proxy";
  const now = new Date();
  let currentDate = new Date(now.getFullYear(), now.getMonth(), 1);
  let selectedDate = null;
  let calendarEvents = [];
  let isMonthDropdownOpen = false;

  initializeMonthDropdown();

  fetch(calendarUrl)
    .then((response) => response.text())
    .then((data) => {
      calendarEvents = parseICS(data).map(normalizeEvent);
      renderCalendar(currentDate);
    })
    .catch((error) => {
      console.error("Calendar data fetch failed:", error);
      renderCalendar(currentDate);
    });

  function parseICS(data) {
    const events = [];
    const lines = data.replace(/\r\n /g, "").replace(/\r/g, "").split("\n");
    let event = null;

    lines.forEach((line) => {
      if (line.startsWith("BEGIN:VEVENT")) {
        event = {};
        return;
      }

      if (line.startsWith("END:VEVENT")) {
        if (event) {
          events.push(event);
        }
        event = null;
        return;
      }

      if (!event) {
        return;
      }

      const [rawKey, ...rest] = line.split(":");
      const value = rest.join(":").trim();

      if (rawKey.startsWith("SUMMARY")) {
        event.summary = value;
      } else if (rawKey.startsWith("UID")) {
        event.uid = value;
      } else if (rawKey.startsWith("DTSTART")) {
        event.start = value;
        event.isAllDay = !value.includes("T");
      } else if (rawKey.startsWith("DTEND")) {
        event.end = value;
      } else if (rawKey.startsWith("RRULE")) {
        event.rrule = value;
      } else if (rawKey.startsWith("EXDATE")) {
        event.exdates = (event.exdates || []).concat(value.split(",").map((item) => item.trim()));
      } else if (rawKey.startsWith("RECURRENCE-ID")) {
        event.recurrenceId = value;
      } else if (rawKey.startsWith("DESCRIPTION")) {
        event.description = value;
      }
    });

    return events;
  }

  function normalizeEvent(event) {
    const startDate = toKSTDate(event.start, event.isAllDay);
    const endDate = toKSTDate(event.end || event.start, event.isAllDay);

    if (event.isAllDay && startDate.toDateString() !== endDate.toDateString()) {
      endDate.setDate(endDate.getDate() - 1);
    }

    return {
      ...event,
      recurrenceIdDate: event.recurrenceId ? toKSTDate(event.recurrenceId, event.isAllDay) : null,
      startDate,
      endDate
    };
  }

  function toKSTDate(icsDateStr, isAllDay = false) {
    if (!icsDateStr) {
      return new Date();
    }

    if (!icsDateStr.includes("T") || isAllDay) {
      return new Date(
        Number(icsDateStr.substring(0, 4)),
        Number(icsDateStr.substring(4, 6)) - 1,
        Number(icsDateStr.substring(6, 8))
      );
    }

    if (icsDateStr.endsWith("Z")) {
      const raw = icsDateStr.slice(0, -1);
      return new Date(Date.UTC(
        Number(raw.substring(0, 4)),
        Number(raw.substring(4, 6)) - 1,
        Number(raw.substring(6, 8)),
        Number(raw.substring(9, 11)),
        Number(raw.substring(11, 13))
      ));
    }

    return new Date(
      Number(icsDateStr.substring(0, 4)),
      Number(icsDateStr.substring(4, 6)) - 1,
      Number(icsDateStr.substring(6, 8)),
      Number(icsDateStr.substring(9, 11)),
      Number(icsDateStr.substring(11, 13))
    );
  }

  function isSameDate(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function toDateKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function getEventsByDateKey(events) {
    const eventMap = new Map();

    events.forEach((event) => {
      const cursor = new Date(event.startDate);

      while (cursor <= event.endDate) {
        const key = toDateKey(cursor);
        if (!eventMap.has(key)) {
          eventMap.set(key, []);
        }
        eventMap.get(key).push(event);
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    return eventMap;
  }

  function overlapsRange(event, rangeStart, rangeEnd) {
    return event.startDate <= rangeEnd && event.endDate >= rangeStart;
  }

  function parseRRule(rrule) {
    if (!rrule) {
      return null;
    }

    return rrule.split(";").reduce((acc, part) => {
      const [key, value] = part.split("=");
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    }, {});
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addTimeOfDay(baseDay, sourceDate) {
    return new Date(
      baseDay.getFullYear(),
      baseDay.getMonth(),
      baseDay.getDate(),
      sourceDate.getHours(),
      sourceDate.getMinutes(),
      sourceDate.getSeconds(),
      sourceDate.getMilliseconds()
    );
  }

  function dayDiff(a, b) {
    const aStart = startOfDay(a).getTime();
    const bStart = startOfDay(b).getTime();
    return Math.round((bStart - aStart) / 86400000);
  }

  function weekDiff(a, b) {
    return Math.floor(dayDiff(a, b) / 7);
  }

  function weekdayToIndex(day) {
    return {
      SU: 0,
      MO: 1,
      TU: 2,
      WE: 3,
      TH: 4,
      FR: 5,
      SA: 6
    }[day];
  }

  function getRecurringInstances(event, rangeStart, rangeEnd, overrideKeys) {
    const rule = parseRRule(event.rrule);
    if (!rule) {
      return overlapsRange(event, rangeStart, rangeEnd) ? [event] : [];
    }

    const interval = Number(rule.INTERVAL || "1");
    const countLimit = Number(rule.COUNT || "0");
    const untilDate = rule.UNTIL ? toKSTDate(rule.UNTIL, false) : null;
    const byDays = (rule.BYDAY || "")
      .split(",")
      .filter(Boolean)
      .map(weekdayToIndex)
      .filter((value) => value !== undefined);
    const duration = event.endDate.getTime() - event.startDate.getTime();
    const instances = [];
    let occurrenceCount = 0;

    for (
      let dayCursor = startOfDay(event.startDate);
      dayCursor <= rangeEnd;
      dayCursor.setDate(dayCursor.getDate() + 1)
    ) {
      const matchesDaily = rule.FREQ === "DAILY" && dayDiff(event.startDate, dayCursor) % interval === 0;
      const weeklyDays = byDays.length > 0 ? byDays : [event.startDate.getDay()];
      const matchesWeekly = (
        rule.FREQ === "WEEKLY" &&
        weekDiff(startOfDay(event.startDate), dayCursor) % interval === 0 &&
        weeklyDays.includes(dayCursor.getDay())
      );

      if (!matchesDaily && !matchesWeekly) {
        continue;
      }

      const occurrenceStart = addTimeOfDay(dayCursor, event.startDate);
      const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);

      if (occurrenceStart < event.startDate) {
        continue;
      }

      if (untilDate && occurrenceStart > untilDate) {
        break;
      }

      occurrenceCount += 1;
      if (countLimit && occurrenceCount > countLimit) {
        break;
      }

      if (overrideKeys.has(String(occurrenceStart.getTime()))) {
        continue;
      }

      if (occurrenceStart <= rangeEnd && occurrenceEnd >= rangeStart) {
        instances.push({
          ...event,
          startDate: occurrenceStart,
          endDate: occurrenceEnd
        });
      }
    }

    return instances;
  }

  function getRenderableEvents(events, rangeStart, rangeEnd) {
    const overrideMap = new Map();

    events.forEach((event) => {
      if (!event.uid || !event.recurrenceIdDate) {
        return;
      }

      if (!overrideMap.has(event.uid)) {
        overrideMap.set(event.uid, new Set());
      }

      overrideMap.get(event.uid).add(String(event.recurrenceIdDate.getTime()));
    });

    const expandedEvents = [];

    events.forEach((event) => {
      if (event.recurrenceIdDate) {
        if (overlapsRange(event, rangeStart, rangeEnd)) {
          expandedEvents.push(event);
        }
        return;
      }

      if (event.rrule) {
        expandedEvents.push(
          ...getRecurringInstances(event, rangeStart, rangeEnd, overrideMap.get(event.uid) || new Set())
        );
        return;
      }

      if (overlapsRange(event, rangeStart, rangeEnd)) {
        expandedEvents.push(event);
      }
    });

    return expandedEvents;
  }

  function ensureSelectedDateInMonth(date) {
    if (!selectedDate) {
      return;
    }

    if (
      selectedDate.getFullYear() !== date.getFullYear() ||
      selectedDate.getMonth() !== date.getMonth()
    ) {
      selectedDate = null;
    }
  }

  function initializeMonthDropdown() {
    const startYear = now.getFullYear() - 5;
    const endYear = now.getFullYear() + 5;

    for (let year = startYear; year <= endYear; year += 1) {
      for (let month = 0; month < 12; month += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "month-option";
        button.textContent = `${year}년 ${month + 1}월`;
        button.dataset.year = String(year);
        button.dataset.month = String(month);
        button.addEventListener("click", () => {
          currentDate = new Date(year, month, 1);
          selectedDate = null;
          renderCalendar(currentDate);
          setMonthDropdownOpen(false);
        });
        monthList.appendChild(button);
      }
    }
  }

  function syncMonthDropdown(date) {
    let activeButton = null;

    monthList.querySelectorAll(".month-option").forEach((button) => {
      const isActive = (
        Number(button.dataset.year) === date.getFullYear() &&
        Number(button.dataset.month) === date.getMonth()
      );

      button.classList.toggle("is-active", isActive);

      if (isActive) {
        activeButton = button;
      }
    });

    if (activeButton && isMonthDropdownOpen) {
      const top = activeButton.offsetTop - 12;
      monthList.scrollTop = Math.max(top, 0);
    }
  }

  function setMonthDropdownOpen(isOpen) {
    isMonthDropdownOpen = isOpen;
    monthDropdown.hidden = !isOpen;
    monthToggle.setAttribute("aria-expanded", String(isOpen));

    if (isOpen) {
      syncMonthDropdown(currentDate);
    }
  }

  function renderCalendar(date) {
    ensureSelectedDateInMonth(date);

    const year = date.getFullYear();
    const month = date.getMonth();

    monthLabel.textContent = `${year}년 ${month + 1}월`;
    syncMonthDropdown(date);
    calendarGrid.innerHTML = "";

    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay();
    const gridStartDate = new Date(year, month, 1 - startOffset);
    const lastOfMonth = new Date(year, month + 1, 0);
    const endOffset = 6 - lastOfMonth.getDay();
    const totalCells = startOffset + lastOfMonth.getDate() + endOffset;
    const gridEndDate = new Date(year, month + 1, endOffset, 23, 59, 59, 999);
    const visibleEvents = getRenderableEvents(calendarEvents, gridStartDate, gridEndDate);
    const eventMap = getEventsByDateKey(visibleEvents);

    for (let index = 0; index < totalCells; index += 1) {
      const cellDate = new Date(gridStartDate);
      cellDate.setDate(gridStartDate.getDate() + index);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "calendar-cell";
      cell.innerHTML = `<span class="calendar-day-number">${cellDate.getDate()}</span>`;

      const key = toDateKey(cellDate);
      const hasEvent = eventMap.has(key);
      const dateEvents = eventMap.get(key) || [];

      if (cellDate.getMonth() !== month) {
        cell.classList.add("is-other-month");
      }

      if (hasEvent) {
        cell.classList.add("has-event");
        cell.style.cssText = getDateCellStyle(dateEvents);
      }

      if (isSameDate(cellDate, now)) {
        cell.classList.add("is-today");
      }

      if (selectedDate && isSameDate(cellDate, selectedDate) && hasEvent) {
        cell.classList.add("is-selected");
      }

      cell.addEventListener("click", () => {
        const nextSelectedDate = new Date(cellDate);

        if (
          nextSelectedDate.getMonth() !== currentDate.getMonth() ||
          nextSelectedDate.getFullYear() !== currentDate.getFullYear()
        ) {
          currentDate = new Date(nextSelectedDate.getFullYear(), nextSelectedDate.getMonth(), 1);
          selectedDate = nextSelectedDate;
        } else if (selectedDate && isSameDate(nextSelectedDate, selectedDate)) {
          selectedDate = null;
        } else {
          selectedDate = nextSelectedDate;
        }

        renderCalendar(currentDate);
      });

      calendarGrid.appendChild(cell);
    }

    renderAppointments(date, eventMap, getRenderableEvents(calendarEvents, new Date(year, month, 1), new Date(year, month + 1, 0, 23, 59, 59, 999)));
  }

  function getEventsForMonth(events, monthDate) {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

    return events.filter((event) => event.startDate <= monthEnd && event.endDate >= monthStart);
  }

  function formatSectionTitle(date) {
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 일정`;
  }

  function formatSelectedSectionTitle(date) {
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 일정`;
  }

  function formatMonthDay(date) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  function formatEventDatePrefix(event) {
    return formatMonthDay(event.startDate);
  }

  function formatEventTime(event) {
    if (event.isAllDay) {
      if (!isSameDate(event.startDate, event.endDate)) {
        return `${formatMonthDay(event.startDate)}~${formatMonthDay(event.endDate)}`;
      }

      return "종일";
    }

    const formatter = new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Seoul"
    });

    return `${formatter.format(event.startDate)} - ${formatter.format(event.endDate)}`;
  }

  function getEventColors(summary = "") {
    const title = summary.toLowerCase();

    if (title.includes("4층")) {
      return {
        background: "#cdf1ce",
        foreground: "#008404"
      };
    }

    if (title.includes("5층")) {
      return {
        background: "#cdf1ce",
        foreground: "#008404"
      };
    }

    if (title.includes("꿈청 금요기도회")) {
      return {
        background: "#d7f0ff",
        foreground: "#0a67a2"
      };
    }

    if (title.includes("수련회")) {
      return {
        background: "#ffdcd5",
        foreground: "#EA1515"
      };
    }

    if (title.includes("선교")) {
      return {
        background: "#ffe1fa",
        foreground: "#EA15BB"
      };
    }

    if (title.includes("금요")) {
      return {
        background: "#ffcde9",
        foreground: "#cf2b7a"
      };
    }

    return {
      background: "#d9e4ff",
      foreground: "#3F15EA"
    };
  }

  function getEventStyle(event) {
    const colors = getEventColors(event.summary || "");

    return [
      `--event-bg: ${colors.background}`,
      `--event-fg: ${colors.foreground}`
    ].join("; ");
  }

  function getDateCellStyle(events) {
    if (!events || events.length === 0) {
      return "";
    }

    const colors = getEventColors(events[0].summary || "");

    return [
      `--cell-bg: ${colors.background}`,
      `--cell-fg: ${colors.foreground}`
    ].join("; ");
  }

  function renderAppointments(monthDate, eventMap, monthEvents) {
    const isFilteredByDate = Boolean(selectedDate);
    const events = isFilteredByDate
      ? (eventMap.get(toDateKey(selectedDate)) || [])
      : monthEvents;

    selectedDateLabel.textContent = isFilteredByDate
      ? formatSelectedSectionTitle(selectedDate)
      : formatSectionTitle(monthDate);
    appointmentList.innerHTML = "";

    const sortedEvents = [...events].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    if (sortedEvents.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = "선택한 날짜에 등록된 일정이 없습니다.";
      appointmentList.appendChild(empty);
      return;
    }

    sortedEvents.forEach((event) => {
      const item = document.createElement("li");
      item.className = "appointment-card";
      item.style.cssText = getEventStyle(event);
      const titleText = escapeHtml(event.summary || "제목 없는 일정");
      const titleMarkup = isFilteredByDate
        ? `<span class="appointment-title">${titleText}</span>`
        : `
          <span class="appointment-date-prefix">${formatEventDatePrefix(event)}</span>
          <span class="appointment-title">${titleText}</span>
        `;

      item.innerHTML = `
        <div class="appointment-main">
          ${titleMarkup}
        </div>
        <span class="appointment-time">${formatEventTime(event)}</span>
      `;

      appointmentList.appendChild(item);
    });
  }

  function escapeHtml(text) {
    return text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  prevBtn.addEventListener("click", () => {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    renderCalendar(currentDate);
  });

  nextBtn.addEventListener("click", () => {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    renderCalendar(currentDate);
  });

  monthToggle.addEventListener("click", () => {
    setMonthDropdownOpen(!isMonthDropdownOpen);
  });

  document.addEventListener("click", (event) => {
    if (
      isMonthDropdownOpen &&
      !monthDropdown.contains(event.target) &&
      !monthToggle.contains(event.target)
    ) {
      setMonthDropdownOpen(false);
    }
  });
});
