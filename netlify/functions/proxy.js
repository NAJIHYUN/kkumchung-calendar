export async function handler(event, context) {
  const url = "https://calendar.google.com/calendar/ical/kkumchung1@gmail.com/public/basic.ics?refresh=1";

  try {
    const res = await fetch(url);
    const text = await res.text();

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "text/plain",
      },
      body: text,
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: "Fetch error: " + err.message,
    };
  }
}
