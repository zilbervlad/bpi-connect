const API_BASE_URL = "https://bpi-connect.onrender.com";

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

export async function sendApiThreadMessage(threadId, senderUserId, body, requiresAck = false) {
  const response = await fetch(`${API_BASE_URL}/api/threads/${threadId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender_user_id: senderUserId,
      body,
      requires_ack: requiresAck,
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

export async function loginApiUser(email, password) {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not log in");
  }

  return data.user;
}

export async function createInviteApiUser({ name, email, role, storeNumber, area }) {
  const response = await fetch(`${API_BASE_URL}/api/invites`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      email,
      role,
      store_number: storeNumber,
      area,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not create invite");
  }

  return data;
}

export async function fetchApiStores() {
  const response = await fetch(`${API_BASE_URL}/api/stores`);
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not load stores");
  }

  return data.stores;
}

export async function fetchApiUserDetail(userId) {
  const response = await fetch(`${API_BASE_URL}/api/users/${userId}`);
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not load user");
  }

  return data.user;
}

export async function updateApiUser(userId, updates) {
  const response = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not update user");
  }

  return data.user;
}

export async function addApiUserStoreAssignment(userId, { storeNumber, assignmentType }) {
  const response = await fetch(`${API_BASE_URL}/api/users/${userId}/store-assignments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      store_number: storeNumber,
      assignment_type: assignmentType,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not assign store");
  }

  return data.user;
}

export async function removeApiUserStoreAssignment(userId, assignmentId) {
  const response = await fetch(`${API_BASE_URL}/api/users/${userId}/store-assignments/${assignmentId}`, {
    method: "DELETE",
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not remove store assignment");
  }

  return data.user;
}

export async function fetchApiAreas() {
  const response = await fetch(`${API_BASE_URL}/api/areas`);
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not load areas");
  }

  return data.areas;
}

export async function createApiArea(name) {
  const response = await fetch(`${API_BASE_URL}/api/areas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not create area");
  }

  return data.area;
}

export async function createApiStore({ storeNumber, name, area }) {
  const response = await fetch(`${API_BASE_URL}/api/stores`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      store_number: storeNumber,
      name,
      area,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not create store");
  }

  return data.store;
}

export async function updateApiStore(storeId, updates) {
  const response = await fetch(`${API_BASE_URL}/api/stores/${storeId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not update store");
  }

  return data.store;
}

export async function toggleApiThreadMessageReaction(messageId, userId, emoji = "👍") {
  const response = await fetch(`${API_BASE_URL}/api/thread-messages/${messageId}/reactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: userId,
      emoji,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not update reaction");
  }

  return data;
}

export async function uploadApiUserAvatar(userId, imageData) {
  const response = await fetch(`${API_BASE_URL}/api/users/${userId}/avatar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_data: imageData,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not upload profile picture");
  }

  return data.user;
}

export async function resendApiUserInvite(userId) {
  const response = await fetch(`${API_BASE_URL}/api/users/${userId}/resend-invite`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not resend invite");
  }

  return data;
}

export async function deleteApiArea(areaId) {
  const response = await fetch(`${API_BASE_URL}/api/areas/${areaId}`, {
    method: "DELETE",
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not delete area");
  }

  return data;
}

export async function createApiThread({ name, threadType = "group", createdByUserId }) {
  const response = await fetch(`${API_BASE_URL}/api/threads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      thread_type: threadType,
      created_by_user_id: createdByUserId,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not create group");
  }

  return data.thread;
}

export async function updateApiThread(threadId, updates) {
  const response = await fetch(`${API_BASE_URL}/api/threads/${threadId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not update group");
  }

  return data.thread;
}

export async function addApiThreadMember(threadId, userId, memberRole = "member") {
  const response = await fetch(`${API_BASE_URL}/api/threads/${threadId}/members`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: userId,
      member_role: memberRole,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not add group member");
  }

  return data.thread;
}

export async function removeApiThreadMember(threadId, userId) {
  const response = await fetch(`${API_BASE_URL}/api/threads/${threadId}/members/${userId}`, {
    method: "DELETE",
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not remove group member");
  }

  return data.thread;
}

export async function acknowledgeApiThreadMessage(messageId, userId) {
  const response = await fetch(`${API_BASE_URL}/api/thread-messages/${messageId}/ack`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: userId,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not acknowledge message");
  }

  return data.message;
}


export async function sendApiThreadImageMessage(threadId, senderUserId, imageData, body = "", metadata = {}) {
  const response = await fetch(`${API_BASE_URL}/api/threads/${threadId}/messages/image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender_user_id: senderUserId,
      body,
      image_data: imageData,
      mime_type: metadata.mimeType || "image/jpeg",
      original_filename: metadata.fileName || "chat-image.jpg",
      requires_ack: Boolean(metadata.requiresAck),
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not send image");
  }

  return data.message;
}

export async function requestApiPasswordReset(email) {
  const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not request password reset");
  }

  return data;
}

export async function sendApiUserPasswordReset(userId) {
  const response = await fetch(`${API_BASE_URL}/api/users/${userId}/send-password-reset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not send password reset");
  }

  return data;
}
