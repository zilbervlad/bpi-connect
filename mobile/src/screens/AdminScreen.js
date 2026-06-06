import { useEffect, useMemo, useState } from "react";
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
import { UserAvatar } from "../components/UserAvatar";
import QRCode from "react-native-qrcode-svg";
import {
  createInviteApiUser,
  fetchApiStores,
  fetchApiUsers,
  fetchApiUserDetail,
  updateApiUser,
  addApiUserStoreAssignment,
  removeApiUserStoreAssignment,
  resendApiUserInvite,
  sendApiUserPasswordReset,
  fetchApiAreas,
  createApiArea,
  deleteApiArea,
  createApiStore,
  updateApiStore,
  createApiThread,
  updateApiThread,
} from "../api/client";

const roles = [
  { label: "TM", value: "tm" },
  { label: "MIT", value: "manager" },
  { label: "General Manager", value: "general_manager" },
  { label: "Coach", value: "coach" },
  { label: "HR", value: "hr" },
  { label: "Admin", value: "admin" },
];

const roleLabels = {
  tm: "TM",
  manager: "MIT",
  general_manager: "General Manager",
  coach: "Coach",
  supervisor: "Coach",
  hr: "HR",
  admin: "Admin",
};

export function AdminScreen({ user }) {
  const [activeSection, setActiveSection] = useState("people");
  const [users, setUsers] = useState([]);
  const [stores, setStores] = useState([]);
  const [areas, setAreas] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [peopleSearch, setPeopleSearch] = useState("");
  const [peopleRoleFilter, setPeopleRoleFilter] = useState("all");
  const [peopleStoreFilter, setPeopleStoreFilter] = useState("all");
  const [showInactiveUsers, setShowInactiveUsers] = useState(false);

  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("tm");
  const [inviteStoreNumber, setInviteStoreNumber] = useState("");
  const [inviteArea, setInviteArea] = useState("");
  const [detailStoreNumber, setDetailStoreNumber] = useState("");
  const [createdInvite, setCreatedInvite] = useState(null);
  const [resentInvite, setResentInvite] = useState(null);
  const [passwordResetResult, setPasswordResetResult] = useState(null);

  const [newAreaName, setNewAreaName] = useState("");
  const [newStoreNumber, setNewStoreNumber] = useState("");
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreArea, setNewStoreArea] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupType, setNewGroupType] = useState("group");
  const [newGroupMemberIds, setNewGroupMemberIds] = useState([]);

  const canManage = ["Admin", "HR"].includes(user.role);

  const filteredUsers = useMemo(() => {
    return users.filter((item) => {
      const searchValue = peopleSearch.trim().toLowerCase();

      const matchesSearch =
        !searchValue ||
        item.name?.toLowerCase().includes(searchValue) ||
        item.email?.toLowerCase().includes(searchValue) ||
        item.role?.toLowerCase().includes(searchValue);

      const matchesRole =
        peopleRoleFilter === "all" || item.role === peopleRoleFilter;

      const matchesStore =
        peopleStoreFilter === "all" ||
        item.store === peopleStoreFilter ||
        item.store_name === `Store ${peopleStoreFilter}`;

      return matchesSearch && matchesRole && matchesStore;
    });
  }, [users, peopleSearch, peopleRoleFilter, peopleStoreFilter]);

  const activeUsers = filteredUsers.filter((item) => item.is_active);
  const inactiveUsers = filteredUsers.filter((item) => !item.is_active);

  const groupMemberOptions = users
    .filter((item) => item.is_active)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  function toggleNewGroupMember(userId) {
    setNewGroupMemberIds((current) => {
      const normalizedId = Number(userId);

      if (current.some((item) => Number(item) === normalizedId)) {
        return current.filter((item) => Number(item) !== normalizedId);
      }

      return [...current, normalizedId];
    });
  }


  useEffect(() => {
    if (canManage) {
      loadAdminData();
    }
  }, [canManage]);

  async function loadAdminData() {
    setErrorMessage("");

    try {
      const [loadedUsers, loadedStores, loadedAreas] = await Promise.all([
        fetchApiUsers(),
        fetchApiStores(),
        fetchApiAreas(),
      ]);

      setUsers(loadedUsers);
      setStores(loadedStores);
      setAreas(loadedAreas);

      if (loadedStores[0]?.store_number && !inviteStoreNumber) {
        setInviteStoreNumber(loadedStores[0].store_number);
      }

      if (loadedAreas[0]?.name) {
        if (!inviteArea) setInviteArea(loadedAreas[0].name);
        if (!newStoreArea) setNewStoreArea(loadedAreas[0].name);
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
      setDetailStoreNumber(detail.store || detail.store_number || "");
      setResentInvite(null);
      setPasswordResetResult(null);
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

    if (!inviteName.trim() || !inviteEmail.trim() || !inviteRole) {
      setErrorMessage("Name, email, and role are required.");
      return;
    }

    setIsLoading(true);

    try {
      const invite = await createInviteApiUser({
        name: inviteName.trim(),
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        storeNumber: shouldShowPrimaryStoreControls(inviteRole) ? inviteStoreNumber : "",
        area: inviteArea,
        actorUserId: user.id,
      });

      setCreatedInvite(invite);
      setStatusMessage("Invite created.");
      setInviteName("");
      setInviteEmail("");
      setInviteRole("tm");
      await loadAdminData();
    } catch (error) {
      setErrorMessage(error.message || "Could not create invite.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateGroup() {
    setErrorMessage("");
    setStatusMessage("");

    if (!newGroupName.trim()) {
      setErrorMessage("Group name is required.");
      return;
    }

    setIsLoading(true);

    try {
      await createApiThread({
        name: newGroupName.trim(),
        threadType: newGroupType,
        createdByUserId: user.id,
        memberIds: newGroupMemberIds,
      });

      setNewGroupName("");
      setNewGroupMemberIds([]);
      setStatusMessage("Group created.");
      await loadAdminData();
    } catch (error) {
      setErrorMessage(error.message || "Could not create group.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateArea() {
    setErrorMessage("");
    setStatusMessage("");

    if (!newAreaName.trim()) {
      setErrorMessage("Area name is required.");
      return;
    }

    setIsLoading(true);

    try {
      await createApiArea(newAreaName.trim(), user.id);
      setNewAreaName("");
      setStatusMessage("Area created.");
      await loadAdminData();
    } catch (error) {
      setErrorMessage(error.message || "Could not create area.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDeleteArea(areaId, areaName) {
    setErrorMessage("");
    setStatusMessage("");

    if (areaName === "Company") {
      setErrorMessage("Company area cannot be deleted.");
      return;
    }

    setIsLoading(true);

    try {
      await deleteApiArea(areaId, user.id);
      setStatusMessage("Area deleted.");
      await loadAdminData();
    } catch (error) {
      setErrorMessage(error.message || "Could not delete area.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateStore() {
    setErrorMessage("");
    setStatusMessage("");

    if (!newStoreNumber.trim()) {
      setErrorMessage("Store number is required.");
      return;
    }

    setIsLoading(true);

    try {
      await createApiStore({
        storeNumber: newStoreNumber.trim(),
        name: newStoreName.trim() || `Store ${newStoreNumber.trim()}`,
        area: newStoreArea,
        actorUserId: user.id,
      });

      setNewStoreNumber("");
      setNewStoreName("");
      setStatusMessage("Store created.");
      await loadAdminData();
    } catch (error) {
      setErrorMessage(error.message || "Could not create store.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggleStoreActive(store) {
    setErrorMessage("");
    setStatusMessage("");
    setIsLoading(true);

    try {
      await updateApiStore(store.id, { is_active: !store.is_active }, user.id);
      setStatusMessage(store.is_active ? "Store deactivated." : "Store reactivated.");
      await loadAdminData();
    } catch (error) {
      setErrorMessage(error.message || "Could not update store.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUpdateStoreArea(storeId, areaName) {
    setErrorMessage("");
    setStatusMessage("");
    setIsLoading(true);

    try {
      await updateApiStore(storeId, { area: areaName }, user.id);
      setStatusMessage("Store area updated.");
      await loadAdminData();
    } catch (error) {
      setErrorMessage(error.message || "Could not update store.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSendPasswordReset() {
    if (!selectedUser) return;

    setErrorMessage("");
    setStatusMessage("");
    setPasswordResetResult(null);
    setIsLoading(true);

    try {
      const result = await sendApiUserPasswordReset(selectedUser.id, user.id);
      setSelectedUser(result.user);
      setPasswordResetResult(result);

      if (result.reset_email_sent) {
        setStatusMessage("Password reset email sent.");
      } else {
        setStatusMessage("Password reset link created, but email did not send.");
      }

      await loadAdminData();
    } catch (error) {
      setErrorMessage(error.message || "Could not send password reset.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResendInvite() {
    if (!selectedUser) return;

    setErrorMessage("");
    setStatusMessage("");
    setResentInvite(null);
    setIsLoading(true);

    try {
      const result = await resendApiUserInvite(selectedUser.id, user.id);
      setSelectedUser(result.user);
      setResentInvite(result);

      if (result.invite_email_sent) {
        setStatusMessage("Invite email resent.");
      } else {
        setStatusMessage("Invite link regenerated, but email did not send.");
      }

      await loadAdminData();
    } catch (error) {
      setErrorMessage(error.message || "Could not resend invite.");
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
      const updated = await updateApiUser(selectedUser.id, {
        role: nextRole,
        actor_user_id: user.id,
      });
      setSelectedUser(updated);
      setStatusMessage("Role updated.");
      await loadAdminData();
    } catch (error) {
      setErrorMessage(error.message || "Could not update role.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAssignStore(assignmentType, storeNumber) {
    if (!selectedUser) return;

    setErrorMessage("");
    setStatusMessage("");
    setIsLoading(true);

    try {
      const updated = await addApiUserStoreAssignment(selectedUser.id, {
        storeNumber,
        assignmentType,
        actorUserId: user.id,
      });

      setSelectedUser(updated);
      setStatusMessage(
        assignmentType === "primary"
          ? `Primary store set to ${storeNumber}.`
          : `Oversight store ${storeNumber} added.`
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
      const updated = await removeApiUserStoreAssignment(selectedUser.id, assignmentId, user.id);
      setSelectedUser(updated);
      setStatusMessage("Store assignment removed.");
      await loadAdminData();
    } catch (error) {
      setErrorMessage(error.message || "Could not remove assignment.");
    } finally {
      setIsLoading(false);
    }
  }

  if (!canManage) {
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
            Ask an Admin or HR user to create or manage users.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <HeaderBlock
        eyebrow="ADMIN"
        title="Admin"
        subtitle={`${users.filter((item) => item.is_active).length} active users · ${stores.length} stores · ${areas.length} areas`}
      />


      <View style={localStyles.navCard}>
        <AdminTab label="Users" value="people" activeSection={activeSection} setActiveSection={setActiveSection} />
        <AdminTab label="Invite" value="invite" activeSection={activeSection} setActiveSection={setActiveSection} />
        <AdminTab label="Stores" value="stores" activeSection={activeSection} setActiveSection={setActiveSection} />
        <AdminTab label="Groups" value="groups" activeSection={activeSection} setActiveSection={setActiveSection} />
        <AdminTab label="Areas" value="areas" activeSection={activeSection} setActiveSection={setActiveSection} />
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

      {activeSection === "people" && (
        <View style={localStyles.card}>
          <Text style={localStyles.sectionHeading}>Users</Text>

          <TextInput
            value={peopleSearch}
            onChangeText={setPeopleSearch}
            placeholder="Search users..."
            placeholderTextColor="#7b8da0"
            style={localStyles.searchInput}
          />

          <Text style={localStyles.label}>Role</Text>
          <PillGrid
            options={[{ label: "All", value: "all" }, ...roles]}
            selectedValue={peopleRoleFilter}
            onSelect={setPeopleRoleFilter}
          />

          <Text style={localStyles.label}>Store</Text>
          <PillGrid
            options={[
              { label: "All Stores", value: "all" },
              ...stores.map((store) => ({
                label: `Store ${store.store_number}`,
                value: store.store_number,
              })),
            ]}
            selectedValue={peopleStoreFilter}
            onSelect={setPeopleStoreFilter}
          />

          <View style={localStyles.peopleSplit}>
            <MiniStat label="Active" value={activeUsers.length} />
            <MiniStat label="Deactivated" value={inactiveUsers.length} />
          </View>

          <Text style={localStyles.label}>Active Users</Text>
          {activeUsers.length ? (
            activeUsers.map((item) => (
              <UserRow key={item.id} item={item} onPress={() => openUserDetail(item.id)} />
            ))
          ) : (
            <Text style={localStyles.emptyText}>No active users match those filters.</Text>
          )}

          <TouchableOpacity
            style={localStyles.deactivatedToggle}
            onPress={() => setShowInactiveUsers((current) => !current)}
          >
            <Text style={localStyles.deactivatedToggleText}>
              {showInactiveUsers ? "Hide Deactivated" : `Show Deactivated (${inactiveUsers.length})`}
            </Text>
          </TouchableOpacity>

          {showInactiveUsers && (
            <View style={localStyles.deactivatedBlock}>
              {inactiveUsers.length ? (
                inactiveUsers.map((item) => (
                  <UserRow
                    key={item.id}
                    item={item}
                    inactive
                    onPress={() => openUserDetail(item.id)}
                  />
                ))
              ) : (
                <Text style={localStyles.emptyText}>No deactivated users match those filters.</Text>
              )}
            </View>
          )}
        </View>
      )}

      {activeSection === "invite" && (
        <View style={localStyles.card}>
          <Text style={localStyles.sectionHeading}>Invite User</Text>

          <Text style={localStyles.label}>Name</Text>
          <TextInput
            value={inviteName}
            onChangeText={setInviteName}
            placeholder="Name"
            placeholderTextColor="#7b8da0"
            style={localStyles.input}
          />

          <Text style={localStyles.label}>Email</Text>
          <TextInput
            value={inviteEmail}
            onChangeText={setInviteEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor="#7b8da0"
            style={localStyles.input}
          />

          <Text style={localStyles.label}>Role</Text>
          <PillGrid options={roles} selectedValue={inviteRole} onSelect={setInviteRole} />

          {shouldShowPrimaryStoreControls(inviteRole) && (
            <>
              <Text style={localStyles.label}>Primary Store</Text>
              <PillGrid
                options={stores.map((store) => ({
                  label: `Store ${store.store_number}`,
                  value: store.store_number,
                }))}
                selectedValue={inviteStoreNumber}
                onSelect={setInviteStoreNumber}
              />
            </>
          )}

          <Text style={localStyles.label}>Area</Text>
          <PillGrid
            options={areas.map((item) => ({ label: item.name, value: item.name }))}
            selectedValue={inviteArea}
            onSelect={setInviteArea}
          />

          <TouchableOpacity
            style={[styles.primaryButton, isLoading && localStyles.disabledButton]}
            onPress={handleCreateInvite}
            disabled={isLoading}
          >
            <Text style={styles.primaryButtonText}>
              {isLoading ? "Sending Invite..." : "Send Invite"}
            </Text>
          </TouchableOpacity>

          {createdInvite && (
            <View style={localStyles.inviteCard}>
              <Text style={localStyles.inviteTitle}>
                {createdInvite.invite_email_sent ? "Invite sent" : "Invite created"}
              </Text>

              <Text style={localStyles.inviteText}>
                {createdInvite.invite_email_sent
                  ? "The invite email was sent. The employee can also scan this QR code to set up their account."
                  : "Email was not sent. The employee can still scan this QR code or use the invite link."}
              </Text>

              <View style={localStyles.qrWrap}>
                <QRCode
                  value={createdInvite.invite_url}
                  size={168}
                  backgroundColor="#ffffff"
                  color="#10212b"
                />
              </View>

              <View style={localStyles.inviteUrlBox}>
                <Text style={localStyles.inviteUrl}>{createdInvite.invite_url}</Text>
              </View>

              {!createdInvite.invite_email_sent && createdInvite.invite_email_error ? (
                <Text style={localStyles.inviteError}>
                  Email issue: {createdInvite.invite_email_error}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      )}

      {activeSection === "stores" && (
        <View style={localStyles.card}>
          <Text style={localStyles.sectionHeading}>Stores</Text>

          <View style={localStyles.formCard}>
            <Text style={localStyles.formTitle}>Create Store</Text>

            <TextInput
              value={newStoreNumber}
              onChangeText={setNewStoreNumber}
              placeholder="Store number"
              placeholderTextColor="#7b8da0"
              style={localStyles.input}
              keyboardType="number-pad"
            />

            <TextInput
              value={newStoreName}
              onChangeText={setNewStoreName}
              placeholder="Store name, optional"
              placeholderTextColor="#7b8da0"
              style={localStyles.input}
            />

            <Text style={localStyles.label}>Area</Text>
            <PillGrid
              options={areas.map((item) => ({ label: item.name, value: item.name }))}
              selectedValue={newStoreArea}
              onSelect={setNewStoreArea}
            />

            <TouchableOpacity
              style={[styles.primaryButton, isLoading && localStyles.disabledButton]}
              onPress={handleCreateStore}
              disabled={isLoading}
            >
              <Text style={styles.primaryButtonText}>
                {isLoading ? "Creating Store..." : "Create Store"}
              </Text>
            </TouchableOpacity>
          </View>

          {stores.length ? (
            stores.map((store) => (
              <View key={store.id} style={localStyles.storeCard}>
                <View style={localStyles.rowBetween}>
                  <View>
                    <Text style={localStyles.itemTitle}>Store {store.store_number}</Text>
                    <Text style={localStyles.itemMeta}>{store.name} · {store.area || "No Area"}</Text>
                  </View>
                  <StatusBadge active={store.is_active} />
                </View>

                <TouchableOpacity
                  style={[
                    localStyles.smallDangerButton,
                    !store.is_active && localStyles.smallSuccessButton,
                  ]}
                  onPress={() => handleToggleStoreActive(store)}
                >
                  <Text
                    style={[
                      localStyles.smallDangerButtonText,
                      !store.is_active && localStyles.smallSuccessButtonText,
                    ]}
                  >
                    {store.is_active ? "Deactivate Store" : "Reactivate Store"}
                  </Text>
                </TouchableOpacity>

                <Text style={localStyles.label}>Move to Area</Text>
                <PillGrid
                  options={areas.map((item) => ({ label: item.name, value: item.name }))}
                  selectedValue={store.area}
                  onSelect={(areaName) => handleUpdateStoreArea(store.id, areaName)}
                />
              </View>
            ))
          ) : (
            <Text style={localStyles.emptyText}>No stores created yet.</Text>
          )}
        </View>
      )}

      {activeSection === "groups" && (
        <View style={localStyles.card}>
          <Text style={localStyles.sectionHeading}>Groups</Text>

          <View style={localStyles.formCard}>
            <Text style={localStyles.formTitle}>Create Group</Text>

            <TextInput
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder="Group name"
              placeholderTextColor="#7b8da0"
              style={localStyles.input}
            />

            <Text style={localStyles.label}>Group Type</Text>
            <PillGrid
              options={[
                { label: "Group", value: "group" },
                { label: "Company", value: "company" },
                { label: "Store", value: "store" },
                { label: "Area", value: "area" },
              ]}
              selectedValue={newGroupType}
              onSelect={setNewGroupType}
            />

            <Text style={localStyles.label}>Members</Text>
            <Text style={localStyles.helperText}>
              Select who should be added to this group. You will be added automatically as owner.
            </Text>

            <View style={localStyles.memberPicker}>
              {groupMemberOptions.length ? (
                groupMemberOptions.map((item) => {
                  const selected = newGroupMemberIds.some(
                    (memberId) => Number(memberId) === Number(item.id)
                  );

                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        localStyles.memberPickRow,
                        selected && localStyles.memberPickRowActive,
                      ]}
                      onPress={() => toggleNewGroupMember(item.id)}
                    >
                      <UserAvatar user={item} size={30} />
                      <View style={localStyles.memberPickMain}>
                        <Text style={localStyles.memberPickName}>{item.name}</Text>
                        <Text style={localStyles.memberPickMeta}>
                          {formatRole(item.role)} · {item.store || item.area || "Company"}
                        </Text>
                      </View>
                      <Text style={localStyles.memberPickCheck}>{selected ? "✓" : "+"}</Text>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <Text style={localStyles.emptyText}>No active users available.</Text>
              )}
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, isLoading && localStyles.disabledButton]}
              onPress={handleCreateGroup}
              disabled={isLoading}
            >
              <Text style={styles.primaryButtonText}>
                {isLoading ? "Creating Group..." : `Create Group${newGroupMemberIds.length ? ` (${newGroupMemberIds.length} members)` : ""}`}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={localStyles.emptyText}>
            Groups created here will appear in Chats for selected members.
          </Text>
        </View>
      )}

      {activeSection === "areas" && (
        <View style={localStyles.card}>
          <Text style={localStyles.sectionHeading}>Areas</Text>

          <View style={localStyles.formCard}>
            <Text style={localStyles.formTitle}>Create Area</Text>

            <TextInput
              value={newAreaName}
              onChangeText={setNewAreaName}
              placeholder="Area name"
              placeholderTextColor="#7b8da0"
              style={localStyles.input}
            />

            <TouchableOpacity
              style={[styles.primaryButton, isLoading && localStyles.disabledButton]}
              onPress={handleCreateArea}
              disabled={isLoading}
            >
              <Text style={styles.primaryButtonText}>
                {isLoading ? "Creating Area..." : "Create Area"}
              </Text>
            </TouchableOpacity>
          </View>

          {areas.map((item) => (
            <View key={item.id} style={localStyles.simpleRow}>
              <View style={localStyles.rowBetween}>
                <View>
                  <Text style={localStyles.itemTitle}>{item.name}</Text>
                  <Text style={localStyles.itemMeta}>Area</Text>
                </View>

                {item.name !== "Company" ? (
                  <TouchableOpacity
                    style={localStyles.smallDangerButton}
                    onPress={() => handleDeleteArea(item.id, item.name)}
                  >
                    <Text style={localStyles.smallDangerButtonText}>Delete</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}

      {activeSection === "detail" && selectedUser && (
        <View style={localStyles.card}>
          <TouchableOpacity
            style={localStyles.backButton}
            onPress={() => {
              setSelectedUser(null);
              setActiveSection("people");
            }}
          >
            <Text style={localStyles.backButtonText}>‹ Back to Users</Text>
          </TouchableOpacity>

          <View style={localStyles.detailHeader}>
            <UserAvatar user={selectedUser} size={38} />
            <View style={localStyles.detailMain}>
              <Text style={localStyles.detailName}>{selectedUser.name}</Text>
              <Text style={localStyles.detailMeta}>{selectedUser.email}</Text>
              <Text style={localStyles.detailMeta}>{formatRole(selectedUser.role)} · {selectedUser.area || "Company"}</Text>
            </View>
          </View>

          <Text style={localStyles.label}>Role</Text>
          <PillGrid options={roles} selectedValue={selectedUser.role} onSelect={handleChangeRole} />

          <View style={localStyles.detailSection}>
            <Text style={localStyles.sectionMiniTitle}>Store Assignment</Text>

            <TextInput
              value={detailStoreNumber}
              onChangeText={setDetailStoreNumber}
              placeholder="Store #"
              placeholderTextColor="#7b8da0"
              keyboardType="number-pad"
              style={localStyles.input}
            />

            <View style={localStyles.actionRow}>
              {shouldShowPrimaryStoreControls(selectedUser.role) ? (
                <TouchableOpacity
                  style={localStyles.compactPrimaryButton}
                  onPress={() => handleAssignStore("primary", detailStoreNumber.trim())}
                  disabled={!detailStoreNumber.trim() || isLoading}
                >
                  <Text style={localStyles.compactPrimaryText}>Set Primary</Text>
                </TouchableOpacity>
              ) : null}

              {shouldShowOversightControls(selectedUser.role) ? (
                <TouchableOpacity
                  style={localStyles.compactSecondaryButton}
                  onPress={() => handleAssignStore("oversight", detailStoreNumber.trim())}
                  disabled={!detailStoreNumber.trim() || isLoading}
                >
                  <Text style={localStyles.compactSecondaryText}>Add Oversight</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {!selectedUser.invite_accepted_at && (
            <View style={localStyles.resendInviteBlock}>
              <TouchableOpacity
                style={[styles.secondaryButton, isLoading && localStyles.disabledButton]}
                onPress={handleResendInvite}
                disabled={isLoading}
              >
                <Text style={styles.secondaryButtonText}>
                  {isLoading ? "Sending Invite..." : "Resend Invite"}
                </Text>
              </TouchableOpacity>

              {resentInvite && (
                <View style={localStyles.resendResultCard}>
                  <Text style={localStyles.resendResultTitle}>
                    {resentInvite.invite_email_sent ? "Invite Email Sent" : "Invite Link Ready"}
                  </Text>

                  <Text style={localStyles.resendResultText}>
                    {resentInvite.invite_email_sent
                      ? "The employee was sent a new invite email."
                      : "The email did not send, but this invite link can still be shared."}
                  </Text>

                  <View style={localStyles.inviteUrlBox}>
                    <Text style={localStyles.inviteUrl}>{resentInvite.invite_url}</Text>
                  </View>

                  {!resentInvite.invite_email_sent && resentInvite.invite_email_error ? (
                    <Text style={localStyles.inviteError}>
                      Email issue: {resentInvite.invite_email_error}
                    </Text>
                  ) : null}
                </View>
              )}
            </View>
          )}

          <View style={localStyles.resendInviteBlock}>
            <TouchableOpacity
              style={[styles.secondaryButton, isLoading && localStyles.disabledButton]}
              onPress={handleSendPasswordReset}
              disabled={isLoading}
            >
              <Text style={styles.secondaryButtonText}>
                {isLoading ? "Sending Reset..." : "Send Password Reset"}
              </Text>
            </TouchableOpacity>

            {passwordResetResult && (
              <View style={localStyles.resendResultCard}>
                <Text style={localStyles.resendResultTitle}>
                  {passwordResetResult.reset_email_sent ? "Password Reset Sent" : "Reset Link Ready"}
                </Text>

                <Text style={localStyles.resendResultText}>
                  {passwordResetResult.reset_email_sent
                    ? "The employee was sent a password reset email."
                    : "The email did not send, but this reset link can still be shared."}
                </Text>

                <View style={localStyles.inviteUrlBox}>
                  <Text style={localStyles.inviteUrl}>{passwordResetResult.reset_url}</Text>
                </View>

                {!passwordResetResult.reset_email_sent && passwordResetResult.reset_email_error ? (
                  <Text style={localStyles.inviteError}>
                    Email issue: {passwordResetResult.reset_email_error}
                  </Text>
                ) : null}
              </View>
            )}
          </View>

          <Text style={localStyles.label}>Store Access</Text>

          {selectedUser.store_assignments?.length ? (
            selectedUser.store_assignments.map((assignment) => (
              <View key={assignment.id} style={localStyles.assignmentRow}>
                <View>
                  <Text style={localStyles.itemTitle}>Store {assignment.store.store_number}</Text>
                  <Text style={localStyles.itemMeta}>{assignment.assignment_type}</Text>
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
            <Text style={localStyles.emptyText}>No store assigned.</Text>
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

function AdminTab({ label, value, activeSection, setActiveSection }) {
  const isActive = activeSection === value;

  return (
    <TouchableOpacity
      style={[localStyles.navPill, isActive && localStyles.navPillActive]}
      onPress={() => setActiveSection(value)}
    >
      <Text style={[localStyles.navText, isActive && localStyles.navTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function StatCard({ label, value }) {
  return (
    <View style={localStyles.statCard}>
      <Text style={localStyles.statValue}>{value}</Text>
      <Text style={localStyles.statLabel}>{label}</Text>
    </View>
  );
}

function MiniStat({ label, value }) {
  return (
    <View style={localStyles.miniStat}>
      <Text style={localStyles.miniValue}>{value}</Text>
      <Text style={localStyles.miniLabel}>{label}</Text>
    </View>
  );
}

function UserRow({ item, inactive, onPress }) {
  return (
    <TouchableOpacity
      style={[localStyles.userRow, inactive && localStyles.inactiveUserRow]}
      onPress={onPress}
    >
      <View style={[localStyles.avatar, inactive && localStyles.inactiveAvatar]}>
        <Text style={localStyles.avatarText}>{item.name.charAt(0)}</Text>
      </View>

      <View style={localStyles.userMain}>
        <Text style={localStyles.userName}>{item.name}</Text>
        <Text style={localStyles.userMeta}>
          {formatRole(item.role)} · {item.store_name || item.area || "Company"}
        </Text>
        <Text style={localStyles.userEmail}>{item.email}</Text>
      </View>

      <StatusBadge active={item.is_active} />
    </TouchableOpacity>
  );
}

function StatusBadge({ active }) {
  return (
    <Text style={[localStyles.statusPill, !active && localStyles.statusPillInactive]}>
      {active ? "Active" : "Off"}
    </Text>
  );
}

function PillGrid({ options, selectedValue, onSelect }) {
  return (
    <View style={localStyles.pillGrid}>
      {options.map((item) => {
        const isActive = selectedValue === item.value;

        return (
          <TouchableOpacity
            key={item.value}
            style={[localStyles.pill, isActive && localStyles.pillActive]}
            onPress={() => onSelect(item.value)}
          >
            <Text style={[localStyles.pillText, isActive && localStyles.pillTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
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
  statsGrid: {
    flexDirection: "row",
    gap: 5,
    marginBottom: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 9,
  },
  statValue: {
    color: "#10212b",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -1,
  },
  statLabel: {
    color: "#6b7c8e",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    marginTop: 3,
  },
  navCard: {
    backgroundColor: "#101d2d",
    borderRadius: 16,
    padding: 7,
    marginBottom: 8,
    flexDirection: "row",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  navPill: {
    flex: 1,
    borderRadius: 17,
    paddingVertical: 6,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  navPillActive: {
    backgroundColor: "#e91f3f",
  },
  navText: {
    color: "#b8c6d6",
    fontSize: 12,
    fontWeight: "900",
  },
  navTextActive: {
    color: "#ffffff",
  },
  card: {
    backgroundColor: "#101d2d",
    borderRadius: 18,
    padding: 9,
    marginBottom: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  formCard: {
    backgroundColor: "#07111f",
    borderRadius: 16,
    padding: 9,
    marginBottom: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  formTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 7,
  },
  sectionHeading: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.7,
    marginBottom: 8,
  },
  label: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: "#eef5f8",
    borderRadius: 16,
    paddingHorizontal: 9,
    paddingVertical: 13,
    color: "#10212b",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  searchInput: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 7,
    color: "#10212b",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 7,
  },
  pillGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginBottom: 7,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  pillActive: {
    backgroundColor: "#e91f3f",
    borderColor: "#e91f3f",
  },
  pillText: {
    color: "#b8c6d6",
    fontSize: 12,
    fontWeight: "900",
  },
  pillTextActive: {
    color: "#ffffff",
  },
  peopleSplit: {
    flexDirection: "row",
    gap: 5,
    marginBottom: 7,
  },
  miniStat: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 18,
    padding: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  miniValue: {
    color: "#ffffff",
    fontSize: 25,
    fontWeight: "900",
  },
  miniLabel: {
    color: "#9cadbf",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    marginTop: 2,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderRadius: 18,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.075)",
  },
  inactiveUserRow: {
    opacity: 0.78,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 17,
    backgroundColor: "#e91f3f",
    alignItems: "center",
    justifyContent: "center",
  },
  inactiveAvatar: {
    backgroundColor: "#64748b",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  userMain: {
    flex: 1,
  },
  userName: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 2,
  },
  userMeta: {
    color: "#b8c6d6",
    fontSize: 12,
    fontWeight: "800",
  },
  userEmail: {
    color: "#7f91a5",
    fontSize: 11,
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
    fontSize: 10,
    fontWeight: "900",
  },
  statusPillInactive: {
    color: "#991b2f",
    backgroundColor: "#ffe4e8",
  },
  deactivatedToggle: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: 13,
    marginTop: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  deactivatedToggleText: {
    color: "#93c5fd",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  deactivatedBlock: {
    marginTop: 5,
  },
  qrWrap: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 9,
    alignSelf: "center",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  inviteError: {
    color: "#991b2f",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 5,
    lineHeight: 17,
  },
  inviteCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 9,
    marginTop: 7,
  },
  inviteTitle: {
    color: "#10212b",
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 4,
  },
  inviteText: {
    color: "#526273",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 7,
    fontWeight: "700",
  },
  inviteUrlBox: {
    backgroundColor: "#eef5f8",
    borderRadius: 15,
    padding: 8,
  },
  inviteUrl: {
    color: "#10212b",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "800",
  },
  storeCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 20,
    padding: 8,
    marginBottom: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  simpleRow: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 18,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  smallDangerButton: {
    backgroundColor: "#ffe4e8",
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignSelf: "flex-start",
    marginBottom: 7,
  },
  smallDangerButtonText: {
    color: "#991b2f",
    fontSize: 12,
    fontWeight: "900",
  },
  smallSuccessButton: {
    backgroundColor: "#dcfce7",
  },
  smallSuccessButtonText: {
    color: "#166534",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 7,
    alignItems: "center",
  },
  itemTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  itemMeta: {
    color: "#9cadbf",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
    textTransform: "uppercase",
  },
  detailHeader: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    marginBottom: 8,
  },
  detailAvatar: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: "#e91f3f",
    alignItems: "center",
    justifyContent: "center",
  },
  detailAvatarText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  detailMain: {
    flex: 1,
  },
  detailName: {
    color: "#ffffff",
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  detailMeta: {
    color: "#9cadbf",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  detailSection: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 8,
    marginTop: 7,
    marginBottom: 7,
  },
  sectionMiniTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 6,
  },
  actionRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
  },
  compactPrimaryButton: {
    flex: 1,
    backgroundColor: "#ef1745",
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: "center",
  },
  compactPrimaryText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },
  compactSecondaryButton: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: "center",
  },
  compactSecondaryText: {
    color: "#10212b",
    fontSize: 11,
    fontWeight: "900",
  },
  resendInviteBlock: {
    marginBottom: 7,
  },
  resendResultCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 8,
    marginTop: 5,
  },
  resendResultTitle: {
    color: "#10212b",
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 4,
  },
  resendResultText: {
    color: "#526273",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  assignmentRow: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 18,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  removeButton: {
    backgroundColor: "#ffe4e8",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  removeButtonText: {
    color: "#991b2f",
    fontSize: 12,
    fontWeight: "900",
  },
  backButton: {
    marginBottom: 8,
  },
  backButtonText: {
    color: "#93c5fd",
    fontSize: 15,
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
    marginBottom: 7,
  },
  errorBox: {
    backgroundColor: "#ffe4e8",
    borderRadius: 14,
    padding: 8,
    marginBottom: 8,
  },
  errorText: {
    color: "#991b2f",
    fontSize: 13,
    fontWeight: "800",
  },
  successBox: {
    backgroundColor: "#dcfce7",
    borderRadius: 14,
    padding: 8,
    marginBottom: 8,
  },
  successText: {
    color: "#166534",
    fontSize: 13,
    fontWeight: "900",
  },
  helperText: {
    color: "#6b7c8f",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginBottom: 10,
  },
  memberPicker: {
    gap: 8,
    marginBottom: 14,
  },
  memberPickRow: {
    backgroundColor: "#f7fafc",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dbe5ee",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  memberPickRowActive: {
    backgroundColor: "#fff1f4",
    borderColor: "#e91f3f",
  },
  memberPickMain: {
    flex: 1,
  },
  memberPickName: {
    color: "#10212b",
    fontSize: 13,
    fontWeight: "900",
  },
  memberPickMeta: {
    color: "#6b7c8f",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  memberPickCheck: {
    color: "#e91f3f",
    fontSize: 18,
    fontWeight: "900",
    width: 24,
    textAlign: "center",
  },
  disabledButton: {
    opacity: 0.55,
  },
});
