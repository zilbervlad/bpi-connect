export const privateRecipients = [
  {
    id: "tm-3001-a",
    name: "Alex",
    role: "TM",
    storeGroupId: "store-3001",
    store: "Store 3001",
    area: "North Area",
  },
  {
    id: "tm-3001-b",
    name: "Jordan",
    role: "TM",
    storeGroupId: "store-3001",
    store: "Store 3001",
    area: "North Area",
  },
  {
    id: "mgr-3001",
    name: "Store 3001 Manager",
    role: "Manager",
    storeGroupId: "store-3001",
    store: "Store 3001",
    area: "North Area",
  },
  {
    id: "gm-3001",
    name: "Store 3001 GM",
    role: "General Manager",
    storeGroupId: "store-3001",
    store: "Store 3001",
    area: "North Area",
  },
  {
    id: "tm-3209-a",
    name: "Taylor",
    role: "TM",
    storeGroupId: "store-3209",
    store: "Store 3209",
    area: "North Area",
  },
  {
    id: "mgr-3209",
    name: "Store 3209 Manager",
    role: "Manager",
    storeGroupId: "store-3209",
    store: "Store 3209",
    area: "North Area",
  },
  {
    id: "coach-north",
    name: "North Area Coach",
    role: "Coach",
    storeGroupId: "area-north",
    store: "North Area",
    area: "North Area",
  },
  {
    id: "hr",
    name: "HR Team",
    role: "HR",
    storeGroupId: "company",
    store: "Boston Pie",
    area: "Company",
  },
];

export function getVisiblePrivateRecipients(user) {
  if (!user) return [];

  if (user.role === "Admin" || user.role === "HR") {
    return privateRecipients;
  }

  if (user.role === "Supervisor" || user.role === "Coach") {
    return privateRecipients.filter((recipient) => recipient.area === user.area);
  }

  if (user.role === "Manager" || user.role === "General Manager" || user.role === "TM") {
    return privateRecipients.filter((recipient) => recipient.storeGroupId === user.storeGroupId);
  }

  return [];
}
