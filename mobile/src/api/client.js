const API_BASE_URL = "https://bpi-connect.onrender.com";

export async function fetchApiUsers(viewerUserId = null) {
  const query = viewerUserId ? `?viewer_user_id=${encodeURIComponent(viewerUserId)}` : "";
  const response = await fetch(`${API_BASE_URL}/api/users${query}`);
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Could not load users");
  }

  return data.users;
}
