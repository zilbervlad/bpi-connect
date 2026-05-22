export function getVisibleApiPeople(user, users) {
  if (!user || !users?.length) return [];

  const otherUsers = users.filter((person) => person.id !== user.id);

  if (user.role === "Admin" || user.role === "HR") {
    return otherUsers;
  }

  if (user.role === "Supervisor" || user.role === "Coach") {
    return otherUsers.filter((person) => person.area === user.area);
  }

  if (["Manager", "General Manager", "TM"].includes(user.role)) {
    return otherUsers.filter((person) => person.storeGroupId === user.storeGroupId);
  }

  return [];
}
