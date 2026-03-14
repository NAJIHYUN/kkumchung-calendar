export async function handler() {
  const url = "https://calendar.google.com/calendar/ical/kkumchung1@gmail.com/public/basic.ics?refresh=1";

  try {
    const response = await fetch(url);
    const text = await response.text();

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "text/plain; charset=utf-8"
      },
      body: text
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: `Fetch error: ${error.message}`
    };
  }
}
