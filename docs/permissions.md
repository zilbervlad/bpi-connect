# BPI Connect Permissions

## App Purpose

BPI Connect is the communication hub for Boston Pie teams.

The app supports:
- Private messages
- Store group communication
- Area/team visibility
- Company-wide announcements
- Required acknowledgements
- Read/unread tracking
- Push notifications in a future phase

---

## Roles

### TM

Team Members can:
- Receive company, HR, store, and role-based announcements
- Send private messages to approved users in their store group
- View people in their assigned store group
- Acknowledge required messages

Team Members cannot:
- Send broadcasts
- See other store groups unless explicitly granted
- View company-wide read/acknowledgement reporting

---

### Manager

Managers can:
- Receive announcements
- Send private messages within their store group
- View people in their assigned store group
- Acknowledge required messages

Managers cannot:
- Send company-wide broadcasts
- See unrelated stores
- Manage users or permissions

---

### General Manager

General Managers can:
- Do everything Managers can do
- See communication for their store group
- Message TMs and managers in their assigned store

General Managers cannot:
- Send company-wide broadcasts unless separately granted
- Manage global users or system settings

---

### Supervisor / Coach

Supervisors and Coaches can:
- View each store they oversee
- View people assigned to their area/stores
- Send private messages to users in their area
- Send broadcasts to their area, selected stores, or stores they oversee
- See read/acknowledgement status for messages they send

Supervisors and Coaches cannot:
- Send company-wide messages unless separately granted
- Manage global system settings

---

### HR

HR can:
- Message all users company-wide
- Send company-wide broadcasts
- Send role-based messages, such as all TMs, Managers, or GMs
- Require acknowledgements
- See read/acknowledgement status for HR messages

HR should not automatically have:
- Full operational admin access
- Store settings access
- Maintenance/admin configuration access

---

### Admin

Admins can:
- See all users, stores, areas, and messages
- Send company-wide broadcasts
- Manage users, roles, stores, groups, and permissions
- View read/acknowledgement reporting
- Configure system settings

---

## Message Types

### Private Message

A direct message between approved users.

Examples:
- TM to Manager
- Manager to TM
- Supervisor to GM
- HR to employee

---

### Store Group Message

A message targeted to one store group.

Recipients:
- TMs assigned to that store
- Managers assigned to that store
- General Manager assigned to that store
- Supervisors/Coaches with oversight if included by rule

---

### Area Message

A message targeted to all stores in an area.

Recipients:
- Store groups in that area
- Supervisors/Coaches assigned to that area

---

### Company-wide Broadcast

A message sent to all BPI Connect users.

Allowed roles:
- Admin
- HR

Optional future role:
- Coach, if granted company-wide permission

---

### Required Acknowledgement

A message can require acknowledgement.

The app should track:
- Delivered
- Read
- Acknowledged
- Acknowledged timestamp
- User who acknowledged

---

## Recipient Targeting

Messages can target:
- Individual user
- Store group
- Area group
- Role group
- Company-wide

---

## Backend Notes

Core backend entities should include:

- User
- Store
- Area
- StoreMembership
- AreaAssignment
- Message
- MessageRecipient
- MessageAcknowledgement
- PushToken

