
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
    const lines = data.replace(/\r/g, "").split("\n");
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
          const raw = line.substring(line.indexOf(":") + 1);
          event.start = raw;
          event.isAllDay = !raw.includes("T");
        } else if (line.startsWith("DTEND")) {
          const raw = line.substring(line.indexOf(":") + 1);
          event.end = raw;
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
    return new Date(
      raw.substring(0, 4) + "-" +
      raw.substring(4, 6) + "-" +
      raw.substring(6, 8) + "T" +
      raw.substring(9, 11) + ":" +
      raw.substring(11, 13)
    );
  }

  function renderCalendar(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    monthLabel.textContent = `${year}년 ${month + 1}월`;
    const today = new Date();

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

    // 연속 일정 색칠
    icsEvents.forEach(event => {
      const start = toKSTDate(event.start, event.isAllDay);
      const end = toKSTDate(event.end || event.start, event.isAllDay);

      if (
        start.getMonth() === month || end.getMonth() === month
      ) {
        let current = new Date(start);
        while (current <= end) {
          if (current.getMonth() === month) {
            const index = firstDayIndex + current.getDate() - 1;
            const cell = calendarGrid.children[index];
            if (!cell) break;

            const isStart = current.toDateString() === start.toDateString();
            const isEnd = current.toDateString() === end.toDateString();

            if (isStart && isEnd) {
              cell.classList.add("range-single");
            } else if (isStart) {
              cell.classList.add("range-start");
            } else if (isEnd) {
              cell.classList.add("range-end");
            } else {
              cell.classList.add("range-middle");
            }
          }
          current.setDate(current.getDate() + 1);
        }
      }
    });

    function renderAppointments(events, year, month) {
  const daysKor = ['일', '월', '화', '수', '목', '금', '토'];
  const grouped = [];

  const addedSet = new Set(); // 중복 방지용

  events.forEach(e => {
    const start = toKSTDate(e.start, e.isAllDay);
    const end = toKSTDate(e.end || e.start, e.isAllDay);

    // 이달 일정만 표시
    if (
      start.getMonth() !== month && end.getMonth() !== month
    ) return;

    const key = `${start.toISOString()}__${e.summary}`;
    if (addedSet.has(key)) return;
    addedSet.add(key);

    const startLabel = `${start.getDate()}일 (${daysKor[start.getDay()]})`;
    const endLabel = `${end.getDate()}일 (${daysKor[end.getDay()]})`;
    const dateRange = (start.toDateString() === end.toDateString())
      ? startLabel
      : `${startLabel} ~ ${endLabel}`;

    grouped.push({
      label: dateRange,
      summary: e.summary
    });
  });

  appointmentList.innerHTML = "";
  grouped.sort((a, b) => a.label.localeCompare(b.label)).forEach(e => {
    const header = document.createElement("li");
    header.textContent = e.label;
    header.style.fontWeight = "bold";
    header.style.marginTop = "10px";
    appointmentList.appendChild(header);

    const li = document.createElement("li");
    li.textContent = e.summary;
    appointmentList.appendChild(li);
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
