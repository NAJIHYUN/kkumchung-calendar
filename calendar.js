document.addEventListener("DOMContentLoaded", () => {
  const monthLabel = document.getElementById("month-label");
  const calendarGrid = document.getElementById("calendar-grid");
  const prevBtn = document.getElementById("prev-month");
  const nextBtn = document.getElementById("next-month");
  const monthToggle = document.getElementById("month-toggle");
  const appointmentList = document.getElementById("appointment-list");
  const selectedDateLabel = document.getElementById("selected-date-label");

  const calendarUrl = "/api/proxy";
  const now = new Date();
  let currentDate = new Date(now.getFullYear(), now.getMonth(), 1);
  let selectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let calendarEvents = [];

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
      } else if (rawKey.startsWith("DTSTART")) {
        event.start = value;
        event.isAllDay = !value.includes("T");
      } else if (rawKey.startsWith("DTEND")) {
        event.end = value;
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

    const raw = icsDateStr.replace("Z", "");
    const utcDate = new Date(Date.UTC(
      Number(raw.substring(0, 4)),
      Number(raw.substring(4, 6)) - 1,
      Number(raw.substring(6, 8)),
      Number(raw.substring(9, 11)),
      Number(raw.substring(11, 13))
    ));

    return new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
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

  function ensureSelectedDateInMonth(date) {
    if (
      selectedDate.getFullYear() !== date.getFullYear() ||
      selectedDate.getMonth() !== date.getMonth()
    ) {
      selectedDate = new Date(date.getFullYear(), date.getMonth(), 1);
    }
  }

  function renderCalendar(date) {
    ensureSelectedDateInMonth(date);

    const year = date.getFullYear();
    const month = date.getMonth();
    const eventMap = getEventsByDateKey(calendarEvents);

    monthLabel.textContent = `${year}년 ${month + 1}월`;
    calendarGrid.innerHTML = "";

    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay();
    const gridStartDate = new Date(year, month, 1 - startOffset);
    const lastOfMonth = new Date(year, month + 1, 0);
    const endOffset = 6 - lastOfMonth.getDay();
    const totalCells = startOffset + lastOfMonth.getDate() + endOffset;

    for (let index = 0; index < totalCells; index += 1) {
      const cellDate = new Date(gridStartDate);
      cellDate.setDate(gridStartDate.getDate() + index);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "calendar-cell";
      cell.textContent = cellDate.getDate();

      const key = toDateKey(cellDate);
      const hasEvent = eventMap.has(key);

      if (cellDate.getMonth() !== month) {
        cell.classList.add("is-other-month");
      }

      if (hasEvent) {
        cell.classList.add("has-event");
      }

      if (isSameDate(cellDate, now)) {
        cell.classList.add("is-today");
      }

      if (isSameDate(cellDate, selectedDate) && hasEvent) {
        cell.classList.add("is-selected");
      }

      cell.addEventListener("click", () => {
        selectedDate = new Date(cellDate);
        if (
          selectedDate.getMonth() !== currentDate.getMonth() ||
          selectedDate.getFullYear() !== currentDate.getFullYear()
        ) {
          currentDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        }
        renderCalendar(currentDate);
      });

      calendarGrid.appendChild(cell);
    }

    renderAppointments(eventMap.get(toDateKey(selectedDate)) || []);
  }

  function formatSelectedDate(date) {
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
  }

  function formatEventTime(event) {
    if (event.isAllDay) {
      return "종일";
    }

    const formatter = new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });

    return `${formatter.format(event.startDate)} - ${formatter.format(event.endDate)}`;
  }

  function getEventIcon(event) {
    if (event.isAllDay) {
      return "🎈";
    }

    return event.summary && /회의|미팅|meeting/i.test(event.summary) ? "👥" : "🎫";
  }

  function getEventColors(summary = "") {
    const title = summary.toLowerCase();

    if (title.includes("4층")) {
      return {
        background: "#ffd1ad",
        foreground: "#d76300"
      };
    }

    if (title.includes("5층")) {
      return {
        background: "#cfe0ff",
        foreground: "#295dcb"
      };
    }

    if (title.includes("금요")) {
      return {
        background: "#ffcde9",
        foreground: "#cf2b7a"
      };
    }

    return {
      background: "#d8ccff",
      foreground: "#4b2cff"
    };
  }

  function getEventStyle(event) {
    const colors = getEventColors(event.summary || "");

    return [
      `--event-bg: ${colors.background}`,
      `--event-fg: ${colors.foreground}`
    ].join("; ");
  }

  function renderAppointments(events) {
    selectedDateLabel.textContent = formatSelectedDate(selectedDate);
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

      item.innerHTML = `
        <div class="appointment-main">
          <span class="appointment-icon" aria-hidden="true">${getEventIcon(event)}</span>
          <span class="appointment-title">${escapeHtml(event.summary || "제목 없는 일정")}</span>
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
    currentDate = new Date(now.getFullYear(), now.getMonth(), 1);
    selectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    renderCalendar(currentDate);
  });
});
