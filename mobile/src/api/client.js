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

export async function fetchApiThreads(userId) {
  const response = await fetch(`${API_BASE_URL}/api/threads?user_id=${userId}`);
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not load threads");
  }

  return data.threads;
}

export async function fetchApiThreadMessages(threadId, userId) {
  const response = await fetch(`${API_BASE_URL}/api/threads/${threadId}/messages?user_id=${userId}`);
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not load thread messages");
  }

  return data;
}

export async function sendApiThreadMessage(threadId, senderUserId, body) {
  const response = await fetch(`${API_BASE_URL}/api/threads/${threadId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender_user_id: senderUserId,
      body,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not send thread message");
  }

  return data.message;
}

export async function markApiThreadRead(threadId, userId) {
  const response = await fetch(`${API_BASE_URL}/api/threads/${threadId}/read`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: userId }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not mark thread read");
  }

  return data;
}

export async function findOrCreateDirectThread(senderUserId, recipientUserId) {
  const response = await fetch(`${API_BASE_URL}/api/threads/direct`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender_user_id: senderUserId,
      recipient_user_id: recipientUserId,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not find or create direct thread");
  }

  return data.thread;
}
