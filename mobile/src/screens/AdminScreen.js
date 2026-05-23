import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
} from "react-native";

import { styles } from "../styles/styles";
import { HeaderBlock } from "../components/HeaderBlock";
import {
  createInviteApiUser,
  fetchApiStores,
  fetchApiUsers,
  fetchApiUserDetail,
  updateApiUser,
  addApiUserStoreAssignment,
  removeApiUserStoreAssignment,
} from "../api/client";

const roles = [
  { label: "TM", value: "tm" },
  { label: "Manager", value: "manager" },
  { label: "General Manager", value: "general_manager" },
  { label: "Coach", value: "coach" },
  { label: "HR", value: "hr" },
  { label: "Admin", value: "admin" },
];

const roleLabels = {
  tm: "TM",
  manager: "Manager",
  general_manager: "General Manager",
  coach: "Coach",
  hr: "HR",
  admin: "Admin",
};

export function AdminScreen({ user }) {
  const [activeSection, setActiveSection] = useState("invite");
  const [users, setUsers] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("tm");
  const [storeNumber, setStoreNumber] = useState("3001");
  const [area, setArea] = useState("North Area");
  const [createdInvite, setCreatedInvite] = useState(null);

  const canInvite = ["Admin", "HR"].includes(user.role);

  useEffect(() => {
    if (canInvite) {
      loadAdminData();
    }
  }, [canInvite]);

  async function loadAdminData() {
    setErrorMessage("");

    try {
      const [loadedUsers, loadedStores] = await Promise.all([
        fetchApiUsers(),
        fetchApiStores(),
      ]);

      setUsers(loadedUsers);
      setStores(loadedStores);

      if (loadedStores[0]?.store_number) {
        setStoreNumber(loadedStores[0].store_number);
      }
    } catch (error) {
      setErrorMessage(error.message || "Could not load admin data.");
    }
  }

  async function openUserDetail(userId) {
    setErrorMessage("");
    setStatusMessage("");
    setIsLoading(true);

    try {
      const detail = await fetchApiUserDetail(userId);
      setSelectedUser(detail);
      setActiveSection("detail");
    } catch (error) {
      setErrorMessage(error.message || "Could not load user.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateInvite() {
    setErrorMessage("");
    setStatusMessage("");
    setCreatedInvite(null);

    if (!name.trim() || !email.trim() || !role) {
      setErrorMessage("Name, email, and role are required.");
      return;
    }

    setIsLoading(true);

    try {
      const invite = await createInviteApiUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        storeNumber: shouldShowStore(role) ? storeNumber : "",
        area,
      });

      setCreatedInvite(invite);
      setStatusMessage("Invite created.");
      setName("");
      setEmail("");
      setRole("tm");
      await loadAdminData();
    } catch (error) {
      setErrorMessage(error.message || "Could not create invite.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggleActive() {
    if (!selectedUser) return;

    setErrorMessage("");
    setStatusMessage("");
    setIsLoading(true);

    try {
      const updated = await updateApiUser(selectedUser.id, {
        is_active: !selectedUser.is_active,
      });

      setSelectedUser(updated);
      setStatusMessage(updated.is_active ? "User reactivated." : "User deactivated.");
      await loadAdminData();
    } catch (error) {
      setErrorMessage(error.message || "Could not update user.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleChangeRole(nextRole) {
    if (!selectedUser) return;

    setErrorMessage("");
    setStatusMessage("");
    setIsLoading(true);

    try {
      const updated = await updateApiUser(selectedUser.id, { role: nextRole });
      setSelectedUser(updated);
      setStatusMessage("Role updated.");
      await loadAdminData();
    } catch (error) {
      setErrorMessage(error.message || "Could not update role.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAssignStore(assignmentType, nextStoreNumber) {
    if (!selectedUser) return;

    setErrorMessage("");
    setStatusMessage("");
    setIsLoading(true);

    try {
      const updated = await addApiUserStoreAssignment(selectedUser.id, {
        storeNumber: nextStoreNumber,
        assignmentType,
      });

      setSelectedUser(updated);
      setStatusMessage(
        assignmentType === "primary"
          ? `Primary store set to ${nextStoreNumber}.`
          : `Oversight store ${nextStoreNumber} added.`
      );
      await loadAdminData();
    } catch (error) {
      setErrorMessage(error.message || "Could not assign store.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRemoveAssignment(assignmentId) {
    if (!selectedUser) return;

    setErrorMessage("");
    setStatusMessage("");
    setIsLoading(true);

    try {
      const updated = await removeApiUserStoreAssignment(selectedUser.id, assignmentId);
      setSelectedUser(updated);
      setStatusMessage("Store assignment removed.");
      await loadAdminData();
    } catch (error) {
      setErrorMessage(error.message || "Could not remove assignment.");
    } finally {
      setIsLoading(false);
    }
  }

  if (!canInvite) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
        <HeaderBlock
          eyebrow="ADMIN"
          title="Access denied"
          subtitle="Only Admin and HR accounts can manage users."
        />

        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>You do not have access</Text>
          <Text style={styles.emptyText}>
            Ask an Admin or HR user to create or manage user invites.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <HeaderBlock
        eyebrow="ADMIN"
        title="Admin tools"
        subtitle="Invite users, manage roles, and assign store access."
      />

      <View style={localStyles.navCard}>
        <TouchableOpacity
          style={[localStyles.navPill, activeSection === "invite" && localStyles.navPillActive]}
          onPress={() => setActiveSection("invite")}
        >
          <Text style={[localStyles.navText, activeSection === "invite" && localStyles.navTextActive]}>
            Add Person
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[localStyles.navPill, activeSection === "users" && localStyles.navPillActive]}
          onPress={() => {
            setSelectedUser(null);
            setActiveSection("users");
          }}
        >
          <Text style={[localStyles.navText, activeSection === "users" && localStyles.navTextActive]}>
            Users
          </Text>
        </TouchableOpacity>
      </View>

      {errorMessage ? (
        <View style={localStyles.errorBox}>
          <Text style={localStyles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {statusMessage ? (
        <View style={localStyles.successBox}>
          <Text style={localStyles.successText}>{statusMessage}</Text>
        </View>
      ) : null}

      {activeSection === "invite" && (
        <>
          <View style={localStyles.card}>
            <Text style={localStyles.sectionHeading}>Create invite</Text>

            <Text style={localStyles.label}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Employee name"
              placeholderTextColor="#7b8da0"
              style={localStyles.input}
            />

            <Text style={localStyles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="name@bostonpie.com"
              placeholderTextColor="#7b8da0"
              style={localStyles.input}
            />

            <Text style={localStyles.label}>Role</Text>
            <OptionGrid
              options={roles}
              selectedValue={role}
              onSelect={setRole}
            />

            {shouldShowStore(role) && (
              <>
                <Text style={localStyles.label}>Primary Store</Text>
                <StoreGrid
                  stores={stores}
                  selectedStoreNumber={storeNumber}
                  onSelect={setStoreNumber}
                />
              </>
            )}

            <Text style={localStyles.label}>Area</Text>
            <OptionGrid
              options={[
                { label: "North Area", value: "North Area" },
                { label: "Company", value: "Company" },
              ]}
              selectedValue={area}
              onSelect={setArea}
            />

            <TouchableOpacity
              style={[styles.primaryButton, isLoading && localStyles.disabledButton]}
              onPress={handleCreateInvite}
              disabled={isLoading}
            >
              <Text style={styles.primaryButtonText}>
                {isLoading ? "Creating Invite..." : "Create Invite"}
              </Text>
            </TouchableOpacity>
          </View>

          {createdInvite && (
            <View style={localStyles.inviteCard}>
              <Text style={localStyles.inviteTitle}>Invite created</Text>
              <Text style={localStyles.inviteText}>
                Send this invite link to the employee so they can set their password.
              </Text>

              <View style={localStyles.inviteUrlBox}>
                <Text style={localStyles.inviteUrl}>{createdInvite.invite_url}</Text>
              </View>

              <Text style={localStyles.inviteMeta}>
                User: {createdInvite.user.name} · {createdInvite.user.role}
              </Text>
            </View>
          )}
        </>
      )}

      {activeSection === "users" && (
        <View style={localStyles.card}>
          <Text style={localStyles.sectionHeading}>Users</Text>

          {users.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={localStyles.userRow}
              onPress={() => openUserDetail(item.id)}
            >
              <View style={localStyles.avatar}>
                <Text style={localStyles.avatarText}>{item.name.charAt(0)}</Text>
              </View>

              <View style={localStyles.userMain}>
                <Text style={localStyles.userName}>{item.name}</Text>
                <Text style={localStyles.userMeta}>
                  {formatRole(item.role)} · {item.store_name || item.area || "Company"}
                </Text>
                <Text style={localStyles.userEmail}>{item.email}</Text>
              </View>

              <Text style={[localStyles.statusPill, !item.is_active && localStyles.statusPillInactive]}>
                {item.is_active ? "Active" : "Off"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {activeSection === "detail" && selectedUser && (
        <View style={localStyles.card}>
          <TouchableOpacity
            style={localStyles.backToUsersButton}
            onPress={() => {
              setSelectedUser(null);
              setActiveSection("users");
            }}
          >
            <Text style={localStyles.backToUsersText}>‹ Back to Users</Text>
          </TouchableOpacity>

          <Text style={localStyles.detailName}>{selectedUser.name}</Text>
          <Text style={localStyles.detailMeta}>{selectedUser.email}</Text>

          <Text style={localStyles.label}>Role</Text>
          <OptionGrid
            options={roles}
            selectedValue={selectedUser.role}
            onSelect={handleChangeRole}
          />

          {shouldShowPrimaryStoreControls(selectedUser.role) && (
            <>
              <Text style={localStyles.label}>Primary Store</Text>
              <StoreGrid
                stores={stores}
                selectedStoreNumber={selectedUser.store}
                onSelect={(nextStore) => handleAssignStore("primary", nextStore)}
              />
            </>
          )}

          {shouldShowOversightControls(selectedUser.role) && (
            <>
              <Text style={localStyles.label}>Oversight Stores</Text>
              <StoreGrid
                stores={stores}
                selectedStoreNumber=""
                onSelect={(nextStore) => handleAssignStore("oversight", nextStore)}
              />
            </>
          )}

          <Text style={localStyles.label}>Current Assignments</Text>

          {selectedUser.store_assignments?.length ? (
            selectedUser.store_assignments.map((assignment) => (
              <View key={assignment.id} style={localStyles.assignmentRow}>
                <View>
                  <Text style={localStyles.assignmentTitle}>
                    Store {assignment.store.store_number}
                  </Text>
                  <Text style={localStyles.assignmentMeta}>
                    {assignment.assignment_type}
                  </Text>
                </View>

                <TouchableOpacity
                  style={localStyles.removeButton}
                  onPress={() => handleRemoveAssignment(assignment.id)}
                >
                  <Text style={localStyles.removeButtonText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <Text style={localStyles.emptyText}>No store assignments yet.</Text>
          )}

          <TouchableOpacity
            style={[
              styles.secondaryButton,
              !selectedUser.is_active && localStyles.reactivateButton,
            ]}
            onPress={handleToggleActive}
          >
            <Text
              style={[
                styles.secondaryButtonText,
                !selectedUser.is_active && localStyles.reactivateButtonText,
              ]}
            >
              {selectedUser.is_active ? "Deactivate User" : "Reactivate User"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function OptionGrid({ options, selectedValue, onSelect }) {
  return (
    <View style={localStyles.optionGrid}>
      {options.map((item) => {
        const isActive = selectedValue === item.value;

        return (
          <TouchableOpacity
            key={item.value}
            style={[localStyles.optionChip, isActive && localStyles.optionChipActive]}
            onPress={() => onSelect(item.value)}
          >
            <Text style={[localStyles.optionText, isActive && localStyles.optionTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function StoreGrid({ stores, selectedStoreNumber, onSelect }) {
  return (
    <View style={localStyles.optionGrid}>
      {stores.map((store) => {
        const isActive = selectedStoreNumber === store.store_number;

        return (
          <TouchableOpacity
            key={store.store_number}
            style={[localStyles.optionChip, isActive && localStyles.optionChipActive]}
            onPress={() => onSelect(store.store_number)}
          >
            <Text style={[localStyles.optionText, isActive && localStyles.optionTextActive]}>
              Store {store.store_number}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function shouldShowStore(role) {
  return ["tm", "manager", "general_manager"].includes(role);
}

function shouldShowPrimaryStoreControls(role) {
  return ["tm", "manager", "general_manager"].includes(role);
}

function shouldShowOversightControls(role) {
  return ["coach", "supervisor"].includes(role);
}

function formatRole(role) {
  return roleLabels[role] || role;
}

const localStyles = StyleSheet.create({
  navCard: {
    backgroundColor: "#101d2d",
    borderRadius: 24,
    padding: 8,
    marginBottom: 14,
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  navPill: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  navPillActive: {
    backgroundColor: "#e91f3f",
  },
  navText: {
    color: "#b8c6d6",
    fontSize: 13,
    fontWeight: "900",
  },
  navTextActive: {
    color: "#ffffff",
  },
  card: {
    backgroundColor: "#101d2d",
    borderRadius: 26,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  sectionHeading: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.7,
    marginBottom: 16,
  },
  label: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: "#07111f",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 16,
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  optionChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  optionChipActive: {
    backgroundColor: "#e91f3f",
    borderColor: "#e91f3f",
  },
  optionText: {
    color: "#b8c6d6",
    fontSize: 13,
    fontWeight: "900",
  },
  optionTextActive: {
    color: "#ffffff",
  },
  errorBox: {
    backgroundColor: "#ffe4e8",
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    color: "#991b2f",
    fontSize: 13,
    fontWeight: "800",
  },
  successBox: {
    backgroundColor: "#dcfce7",
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  successText: {
    color: "#166534",
    fontSize: 13,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.55,
  },
  inviteCard: {
    backgroundColor: "#ffffff",
    borderRadius: 26,
    padding: 20,
    marginBottom: 20,
  },
  inviteTitle: {
    color: "#10212b",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  inviteText: {
    color: "#526273",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
    fontWeight: "700",
  },
  inviteUrlBox: {
    backgroundColor: "#eef5f8",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  inviteUrl: {
    color: "#10212b",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "800",
  },
  inviteMeta: {
    color: "#697b8d",
    fontSize: 12,
    fontWeight: "800",
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: "#e91f3f",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
  },
  userMain: {
    flex: 1,
  },
  userName: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 3,
  },
  userMeta: {
    color: "#b8c6d6",
    fontSize: 12,
    fontWeight: "800",
  },
  userEmail: {
    color: "#7f91a5",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  statusPill: {
    color: "#166534",
    backgroundColor: "#dcfce7",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
    fontSize: 11,
    fontWeight: "900",
  },
  statusPillInactive: {
    color: "#991b2f",
    backgroundColor: "#ffe4e8",
  },
  backToUsersButton: {
    marginBottom: 14,
  },
  backToUsersText: {
    color: "#93c5fd",
    fontSize: 15,
    fontWeight: "900",
  },
  detailName: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -1,
    marginBottom: 4,
  },
  detailMeta: {
    color: "#9cadbf",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 20,
  },
  assignmentRow: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  assignmentTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  assignmentMeta: {
    color: "#9cadbf",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
    textTransform: "uppercase",
  },
  removeButton: {
    backgroundColor: "#ffe4e8",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  removeButtonText: {
    color: "#991b2f",
    fontSize: 12,
    fontWeight: "900",
  },
  reactivateButton: {
    backgroundColor: "#dcfce7",
  },
  reactivateButtonText: {
    color: "#166534",
  },
  emptyText: {
    color: "#9cadbf",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 12,
  },
});
