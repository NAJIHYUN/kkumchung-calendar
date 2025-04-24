document.addEventListener("DOMContentLoaded", () => {
  const monthLabel = document.getElementById("month-label");
  const calendarGrid = document.getElementById("calendar-grid");
  const prevBtn = document.getElementById("prev-month");
  const nextBtn = document.getElementById("next-month");
  const appointmentList = document.getElementById("appointment-list");

  let currentDate = new Date();
  let icsEvents = [];

  const calendarUrl = "/api/proxy";

  fetch(calendarUrl)
    .then(response => response.text())
    .then(data => {
      console.log("✅ ICS 데이터 (원본 일부):", data.slice(0, 300));
      icsEvents = parseICS(data);
      renderCalendar(currentDate);
    })
    .catch(err => {
      console.error("❌ Fetch 에러:", err);
    });

  function parseICS(data) {
    const events = [];
    const lines = data.replace(/\r\n /g, "").replace(/\r/g, "").split("\n");
    let event = {};
    let inEvent = false;

    lines.forEach((line) => {
      if (line.startsWith("BEGIN:VEVENT")) {
        inEvent = true;
        event = {};
      } else if (line.startsWith("END:VEVENT")) {
        inEvent = false;
        events.push(event);
      } else if (inEvent) {
        if (line.startsWith("SUMMARY:")) {
          event.summary = line.replace("SUMMARY:", "");
        } else if (line.startsWith("DTSTART")) {
          const raw = line.split(":")[1];
          if (raw) {
            event.start = raw.trim();
            event.isAllDay = !raw.includes("T");
          }
        } else if (line.startsWith("DTEND")) {
          const raw = line.split(":")[1];
          if (raw) {
            event.end = raw.trim();
          }
        } else if (line.startsWith("DESCRIPTION:")) {
          event.description = line.replace("DESCRIPTION:", "");
        }
      }
    });

    return events;
  }

  function toKSTDate(icsDateStr, isAllDay = false) {
    if (!icsDateStr) return new Date();
    if (!icsDateStr.includes("T") || isAllDay) {
      return new Date(
        icsDateStr.substring(0, 4) + "-" +
        icsDateStr.substring(4, 6) + "-" +
        icsDateStr.substring(6, 8)
      );
    }
    const raw = icsDateStr.replace("Z", "");
    const utcDate = new Date(
      raw.substring(0, 4) + "-" +
      raw.substring(4, 6) + "-" +
      raw.substring(6, 8) + "T" +
      raw.substring(9, 11) + ":" +
      raw.substring(11, 13)
    );
    return new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
  }

  function renderCalendar(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const today = new Date();

    monthLabel.textContent = `${year}년 ${month + 1}월`;

    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    const firstDayIndex = startOfMonth.getDay();
    const daysInMonth = endOfMonth.getDate();

    calendarGrid.innerHTML = "";

    for (let i = 0; i < firstDayIndex; i++) {
      calendarGrid.appendChild(document.createElement("div"));
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(year, month, day);
      const cell = document.createElement("div");
      cell.classList.add("calendar-cell");
      cell.textContent = day;

      if (
        dateObj.getFullYear() === today.getFullYear() &&
        dateObj.getMonth() === today.getMonth() &&
        dateObj.getDate() === today.getDate()
      ) {
        cell.classList.add("today");
      }

      calendarGrid.appendChild(cell);
    }

    // ✅ 일정 색칠
    icsEvents.forEach(event => {
      const start = toKSTDate(event.start, event.isAllDay);
      let end = toKSTDate(event.end || event.start, event.isAllDay);

      if (event.isAllDay && start.toDateString() !== end.toDateString()) {
        end.setDate(end.getDate() - 1); // 구글 캘린더 보정
      }

      let current = new Date(start);

      while (current <= end) {
        if (current.getMonth() === month && current.getFullYear() === year) {
          const index = firstDayIndex + current.getDate() - 1;
          const cell = calendarGrid.children[index];
          if (!cell) break;

          const isStart = current.toDateString() === start.toDateString();
          const isEnd = current.toDateString() === end.toDateString();

          if (isStart && isEnd) {
            cell.classList.add("range-single", "range-start", "range-end");
          } else if (isStart) {
            const nextDay = new Date(current);
            nextDay.setDate(current.getDate() + 1);
            if (nextDay > end) {
              cell.classList.add("range-single");
            } else {
              cell.classList.add("range-start");
            }
          } else if (isEnd) {
            cell.classList.add("range-end");
          } else {
            cell.classList.add("range-middle");
          }
        }
        current.setDate(current.getDate() + 1);
      }
    });

    renderAppointments(icsEvents, year, month);
  }

  function renderAppointments(events, year, month) {
    const daysKor = ['일', '월', '화', '수', '목', '금', '토'];
    const grouped = [];
    const addedSet = new Set();

    events.forEach(e => {
      const start = toKSTDate(e.start, e.isAllDay);
      let end = toKSTDate(e.end || e.start, e.isAllDay);

      if (e.isAllDay && start.toDateString() !== end.toDateString()) {
        end.setDate(end.getDate() - 1); // 보정
      }

      if ((start.getMonth() !== month && end.getMonth() !== month) || start.getFullYear() !== year) return;

      const isAllDay = e.isAllDay || !e.start.includes("T");

      if (isAllDay && start.toDateString() !== end.toDateString()) {
        const key = `${e.summary}__${start.toISOString().slice(0, 10)}`;
        if (addedSet.has(key)) return;
        addedSet.add(key);

        const startLabel = `${start.getDate()}일 (${daysKor[start.getDay()]})`;
        const endLabel = `${end.getDate()}일 (${daysKor[end.getDay()]})`;

        grouped.push({
          label: `${startLabel} ~ ${endLabel}`,
          lines: [e.summary],
          date: start
        });
      } else {
        const label = `${start.getDate()}일 (${daysKor[start.getDay()]})`;
        const time = isAllDay ? "" : `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')} - `;
        const existing = grouped.find(g => g.label === label);
        if (existing) {
          existing.lines.push(`${time}${e.summary}`);
        } else {
          grouped.push({
            label,
            lines: [`${time}${e.summary}`],
            date: start
          });
        }
      }
    });

    grouped.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));

    appointmentList.innerHTML = "";
    grouped.forEach(item => {
      const header = document.createElement("li");
      header.textContent = item.label;
      header.style.fontWeight = "bold";
      header.style.marginTop = "10px";
      appointmentList.appendChild(header);

      item.lines.forEach(text => {
        const li = document.createElement("li");
        li.textContent = text;
        appointmentList.appendChild(li);
      });
    });
  }

  prevBtn.addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar(currentDate);
  });

  nextBtn.addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar(currentDate);
  });

  document.querySelector(".plus-btn")?.addEventListener("click", () => {
    window.open("http://pf.kakao.com/_xckXiG/chat", "_blank");
  });
});
