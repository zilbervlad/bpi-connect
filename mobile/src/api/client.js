const API_BASE_URL = "https://bpi-connect.onrender.com";

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const rawText = await response.text();
  let data = null;

  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    const preview = rawText ? rawText.slice(0, 220) : "No response body";
    throw new Error(`API returned non-JSON for ${path}: ${response.status} ${preview}`);
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.error || data.message || "API request failed");
  }

  return data;
}

export async function loginApiUser(email, password) {
  const data = await apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  return data.user;
}

export async function requestApiPasswordReset(email) {
  return apiRequest("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function fetchApiUsers(viewerUserId = null) {
  const query = viewerUserId ? `?viewer_user_id=${encodeURIComponent(viewerUserId)}` : "";
  const data = await apiRequest(`/api/users${query}`);
  return data.users || [];
}

export async function fetchApiUserDetail(userId) {
  const data = await apiRequest(`/api/users/${userId}`);
  return data.user;
}


export async function uploadApiUserAvatar(userId, imageData) {
  const data = await apiRequest(`/api/users/${userId}/avatar`, {
    method: "POST",
    body: JSON.stringify({
      image_data: imageData,
    }),
  });

  return data.user;
}

export async function updateApiUser(userId, updates) {
  const data = await apiRequest(`/api/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });

  return data.user;
}


export async function deleteApiAccount(userId, requesterUserId, confirmText) {
  return apiRequest(`/api/users/${userId}/delete-account`, {
    method: "POST",
    body: JSON.stringify({
      requester_user_id: requesterUserId,
      confirm_text: confirmText,
    }),
  });
}


export async function createInviteApiUser({ name, email, phoneNumber, role, storeNumber, area, actorUserId, bpiOpsUserId }) {
  return apiRequest("/api/users/invite", {
    method: "POST",
    body: JSON.stringify({
      name,
      email,
      phone_number: phoneNumber,
      role,
      store_number: storeNumber,
      area,
      actor_user_id: actorUserId,
      bpi_ops_user_id: bpiOpsUserId,
    }),
  });
}

export async function resendApiUserInvite(userId, actorUserId) {
  return apiRequest(`/api/users/${userId}/resend-invite`, {
    method: "POST",
    body: JSON.stringify({
      actor_user_id: actorUserId,
    }),
  });
}

export async function sendApiUserPasswordReset(userId, actorUserId) {
  return apiRequest(`/api/users/${userId}/password-reset`, {
    method: "POST",
    body: JSON.stringify({
      actor_user_id: actorUserId,
    }),
  });
}

export async function addApiUserStoreAssignment(userId, { storeNumber, assignmentType, actorUserId }) {
  const data = await apiRequest(`/api/users/${userId}/store-assignments`, {
    method: "POST",
    body: JSON.stringify({
      store_number: storeNumber,
      assignment_type: assignmentType,
      actor_user_id: actorUserId,
    }),
  });

  return data.user;
}

export async function removeApiUserStoreAssignment(userId, assignmentId, actorUserId) {
  const data = await apiRequest(`/api/users/${userId}/store-assignments/${assignmentId}`, {
    method: "DELETE",
    body: JSON.stringify({
      actor_user_id: actorUserId,
    }),
  });

  return data.user;
}

export async function fetchApiStores() {
  const data = await apiRequest("/api/stores");
  return data.stores || [];
}

export async function createApiStore({ storeNumber, name, area, actorUserId }) {
  const data = await apiRequest("/api/stores", {
    method: "POST",
    body: JSON.stringify({
      store_number: storeNumber,
      name,
      area,
      actor_user_id: actorUserId,
    }),
  });

  return data.store;
}

export async function updateApiStore(storeId, updates, actorUserId) {
  const data = await apiRequest(`/api/stores/${storeId}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...updates,
      actor_user_id: actorUserId,
    }),
  });

  return data.store;
}

export async function fetchApiAreas() {
  const data = await apiRequest("/api/areas");
  return data.areas || [];
}

export async function createApiArea(name, actorUserId) {
  const data = await apiRequest("/api/areas", {
    method: "POST",
    body: JSON.stringify({
      name,
      actor_user_id: actorUserId,
    }),
  });

  return data.area;
}

export async function deleteApiArea(areaId, actorUserId) {
  return apiRequest(`/api/areas/${areaId}`, {
    method: "DELETE",
    body: JSON.stringify({
      actor_user_id: actorUserId,
    }),
  });
}



export async function markApiMessageRead(messageId, userId) {
  return apiRequest(`/api/messages/${messageId}/read`, {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
    }),
  });
}

export async function acknowledgeApiMessage(messageId, userId) {
  return apiRequest(`/api/messages/${messageId}/acknowledge`, {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
    }),
  });
}

export async function createApiMessage({
  senderUserId,
  title,
  body,
  recipientUserIds,
  messageType = "announcement",
  priority = "normal",
  targetType = "company",
  targetLabel = "Company-wide",
  requiresAck = false,
}) {
  const data = await apiRequest("/api/messages", {
    method: "POST",
    body: JSON.stringify({
      sender_user_id: senderUserId,
      title,
      body,
      recipient_user_ids: recipientUserIds,
      message_type: messageType,
      priority,
      target_type: targetType,
      target_label: targetLabel,
      requires_ack: requiresAck,
    }),
  });

  return data.message;
}

export async function fetchApiMessages(userId) {
  const query = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  const data = await apiRequest(`/api/messages${query}`);
  return data.messages || [];
}

export async function fetchApiThreads(userId) {
  const query = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  const data = await apiRequest(`/api/threads${query}`);
  return data.threads || [];
}

export async function fetchApiThreadMessages(threadId, userId, limit = 30) {
  const params = new URLSearchParams();

  if (userId) {
    params.set("user_id", String(userId));
  }

  if (limit) {
    params.set("limit", String(limit));
  }

  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/api/threads/${threadId}/messages${query}`);
}

export async function sendApiThreadMessage(threadId, senderUserId, body, requiresAck = false) {
  return apiRequest(`/api/threads/${threadId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      sender_user_id: senderUserId,
      body,
      requires_ack: requiresAck,
    }),
  });
}

export async function sendApiThreadImageMessage(
  threadId,
  senderUserId,
  imageData,
  caption = "",
  fileOptions = {}
) {
  return apiRequest(`/api/threads/${threadId}/image-messages`, {
    method: "POST",
    body: JSON.stringify({
      sender_user_id: senderUserId,
      image_data: imageData,
      caption,
      mime_type: fileOptions.mimeType,
      file_name: fileOptions.fileName,
    }),
  });
}

export async function createApiThread({ name, threadType, createdByUserId, memberIds = [] }) {
  const data = await apiRequest("/api/threads", {
    method: "POST",
    body: JSON.stringify({
      name,
      thread_type: threadType,
      created_by_user_id: createdByUserId,
      actor_user_id: createdByUserId,
      member_ids: memberIds,
    }),
  });

  return data.thread;
}

export async function updateApiThread(threadId, updates, actorUserId) {
  const data = await apiRequest(`/api/threads/${threadId}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...updates,
      actor_user_id: actorUserId,
    }),
  });

  return data.thread;
}

export async function deleteApiThreadForUser(threadId, userId) {
  return apiRequest(`/api/threads/${threadId}/delete`, {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
    }),
  });
}


export async function deleteApiThreadForEveryone(threadId, actorUserId) {
  return apiRequest(`/api/threads/${threadId}`, {
    method: "DELETE",
    body: JSON.stringify({
      actor_user_id: actorUserId,
    }),
  });
}


export async function addApiThreadMember(threadId, userId, actorUserId, memberRole = "member") {
  const data = await apiRequest(`/api/threads/${threadId}/members`, {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      actor_user_id: actorUserId,
      member_role: memberRole,
    }),
  });

  return data.thread;
}

export async function removeApiThreadMember(threadId, userId, actorUserId) {
  const data = await apiRequest(`/api/threads/${threadId}/members/${userId}`, {
    method: "DELETE",
    body: JSON.stringify({
      actor_user_id: actorUserId,
    }),
  });

  return data.thread;
}


export async function setApiThreadMuted(threadId, userId, muted) {
  const data = await apiRequest(`/api/threads/${threadId}/mute`, {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      muted,
    }),
  });

  return data.thread;
}

export async function markApiThreadRead(threadId, userId) {
  return apiRequest(`/api/threads/${threadId}/read`, {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
    }),
  });
}


export async function deleteApiThreadMessage(messageId, userId) {
  return apiRequest(`/api/thread-messages/${messageId}`, {
    method: "DELETE",
    body: JSON.stringify({
      user_id: userId,
    }),
  });
}

export async function toggleApiThreadMessageReaction(messageId, userId, emoji) {
  return apiRequest(`/api/thread-messages/${messageId}/reactions`, {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      emoji,
    }),
  });
}

export async function acknowledgeApiThreadMessage(messageId, userId) {
  return apiRequest(`/api/thread-messages/${messageId}/acknowledge`, {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
    }),
  });
}

export async function saveApiUserPushToken(userId, token, options = {}) {
  return apiRequest(`/api/users/${userId}/push-token`, {
    method: "POST",
    body: JSON.stringify({
      token,
      platform: options.platform || "ios",
      device_name: options.deviceName || "iPhone",
    }),
  });
}

export async function setApiThreadFavorite(threadId, userId, favorite) {
  const data = await apiRequest(`/api/threads/${threadId}/favorite`, {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      favorite,
    }),
  });

  return data.thread;
}

export async function findOrCreateDirectThread(senderUserId, recipientUserId) {
  const data = await apiRequest("/api/threads/direct", {
    method: "POST",
    body: JSON.stringify({
      sender_user_id: senderUserId,
      recipient_user_id: recipientUserId,
    }),
  });

  return data.thread;
}
