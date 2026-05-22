const API_BASE_URL = "http://172.20.10.12:5050";

export async function fetchApiUsers() {
  const response = await fetch(`${API_BASE_URL}/api/users`);
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not load users");
  }

  return data.users;
}

export async function fetchApiMessages(userId) {
  const url = userId
    ? `${API_BASE_URL}/api/messages?user_id=${userId}`
    : `${API_BASE_URL}/api/messages`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not load messages");
  }

  return data.messages;
}

export async function markApiMessageRead(messageId, userId) {
  const response = await fetch(`${API_BASE_URL}/api/messages/${messageId}/read`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: userId }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not mark message read");
  }

  return data;
}

export async function acknowledgeApiMessage(messageId, userId) {
  const response = await fetch(`${API_BASE_URL}/api/messages/${messageId}/acknowledge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: userId }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not acknowledge message");
  }

  return data;
}
