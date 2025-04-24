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
          const match = line.match(/DTSTART.*:(.+)/);
          if (match) event.start = match[1];
        } else if (line.startsWith("DTEND")) {
          const match = line.match(/DTEND.*:(.+)/);
          if (match) event.end = match[1];
        } else if (line.startsWith("DESCRIPTION:")) {
          event.description = line.replace("DESCRIPTION:", "");
        }
      }
    });

    return events;
  }

  function toKSTDate(icsDateStr) {
    if (!icsDateStr || !icsDateStr.includes("T")) return new Date(icsDateStr); // 종일 일정 또는 형식 오류
    const utc = new Date(icsDateStr);
    return new Date(utc.getTime() + 9 * 60 * 60 * 1000);
  }

  function renderCalendar(date) {
    const year = date.getFullYear();
    const month = date.getMonth();

    const todayUTC = new Date();
    const today = new Date(todayUTC.getTime() + 9 * 60 * 60 * 1000); // 한국 기준 오늘

    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    const firstDayIndex = startOfMonth.getDay();
    const daysInMonth = endOfMonth.getDate();

    const eventsThisMonth = icsEvents.filter(e => {
      const dt = toKSTDate(e.start);
      return dt.getFullYear() === year && dt.getMonth() === month;
    });

    const highlightDates = eventsThisMonth.map(e => {
      const dt = toKSTDate(e.start);
      return dt.getDate();
    });

    monthLabel.textContent = `${year}년 ${month + 1}월`;
    calendarGrid.innerHTML = "";

    for (let i = 0; i < firstDayIndex; i++) {
      calendarGrid.innerHTML += "<div></div>";
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const thisDay = new Date(year, month, day);
      const div = document.createElement("div");
      div.textContent = day;

      if (
        thisDay.getFullYear() === today.getFullYear() &&
        thisDay.getMonth() === today.getMonth() &&
        thisDay.getDate() === today.getDate()
      ) {
        div.classList.add("today");
      }

      if (highlightDates.includes(day)) {
        div.classList.add("highlight");
      }

      calendarGrid.appendChild(div);
    }

    renderAppointments(eventsThisMonth);
  }

  function renderAppointments(events) {
    const daysKor = ['일', '월', '화', '수', '목', '금', '토'];
    const grouped = {};

    events.forEach(e => {
      const dt = toKSTDate(e.start);
      const label = `${String(dt.getDate()).padStart(2, '0')}일 (${daysKor[dt.getDay()]})`;
      if (!grouped[label]) grouped[label] = [];

      const time = e.start.includes("T")
        ? `${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}`
        : "종일";

      grouped[label].push(`${time} - ${e.summary}`);
    });

    appointmentList.innerHTML = "";
    Object.keys(grouped).sort().forEach(day => {
      const header = document.createElement("li");
      header.textContent = day;
      header.style.fontWeight = "bold";
      header.style.marginTop = "10px";
      appointmentList.appendChild(header);
      grouped[day].forEach(e => {
        const li = document.createElement("li");
        li.textContent = e;
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
});
