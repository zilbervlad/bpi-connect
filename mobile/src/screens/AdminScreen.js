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
  fetchApiAreas,
  createApiArea,
  createApiStore,
  updateApiStore,
} from "../api/client";

const roles = [
  { label: "TM", value: "tm" },
  { label: "Manager", value: "manager" },
  { label: "General Manager", value: "general_manager" },
  { label: "Coach", value: "coach" },
  { label: "Supervisor", value: "supervisor" },
  { label: "HR", value: "hr" },
  { label: "Admin", value: "admin" },
];

const roleLabels = {
  tm: "TM",
  manager: "Manager",
  general_manager: "General Manager",
  coach: "Coach",
  supervisor: "Supervisor",
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
  const [createdInvite, setCreatedInvite] = useState(null);
  const [resentInvite, setResentInvite] = useState(null);

  const [newAreaName, setNewAreaName] = useState("");
  const [newStoreNumber, setNewStoreNumber] = useState("");
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreArea, setNewStoreArea] = useState("");

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
      setResentInvite(null);
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

  async function handleCreateArea() {
    setErrorMessage("");
    setStatusMessage("");

    if (!newAreaName.trim()) {
      setErrorMessage("Area name is required.");
      return;
    }

    setIsLoading(true);

    try {
      await createApiArea(newAreaName.trim());
      setNewAreaName("");
      setStatusMessage("Area created.");
      await loadAdminData();
    } catch (error) {
      setErrorMessage(error.message || "Could not create area.");
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

  async function handleUpdateStoreArea(storeId, areaName) {
    setErrorMessage("");
    setStatusMessage("");
    setIsLoading(true);

    try {
      await updateApiStore(storeId, { area: areaName });
      setStatusMessage("Store area updated.");
      await loadAdminData();
    } catch (error) {
      setErrorMessage(error.message || "Could not update store.");
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
      const result = await resendApiUserInvite(selectedUser.id);
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

  async function handleAssignStore(assignmentType, storeNumber) {
    if (!selectedUser) return;

    setErrorMessage("");
    setStatusMessage("");
    setIsLoading(true);

    try {
      const updated = await addApiUserStoreAssignment(selectedUser.id, {
        storeNumber,
        assignmentType,
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
        title="Command Center"
        subtitle="Manage people, stores, areas, and access."
      />

      <View style={localStyles.statsGrid}>
        <StatCard label="Active" value={users.filter((item) => item.is_active).length} />
        <StatCard label="Stores" value={stores.length} />
        <StatCard label="Areas" value={areas.length} />
      </View>

      <View style={localStyles.navCard}>
        <AdminTab label="People" value="people" activeSection={activeSection} setActiveSection={setActiveSection} />
        <AdminTab label="Add" value="invite" activeSection={activeSection} setActiveSection={setActiveSection} />
        <AdminTab label="Stores" value="stores" activeSection={activeSection} setActiveSection={setActiveSection} />
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
          <Text style={localStyles.sectionHeading}>People</Text>

          <TextInput
            value={peopleSearch}
            onChangeText={setPeopleSearch}
            placeholder="Search name, email, or position"
            placeholderTextColor="#7b8da0"
            style={localStyles.searchInput}
          />

          <Text style={localStyles.label}>Position</Text>
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

          <Text style={localStyles.label}>Active People</Text>
          {activeUsers.length ? (
            activeUsers.map((item) => (
              <UserRow key={item.id} item={item} onPress={() => openUserDetail(item.id)} />
            ))
          ) : (
            <Text style={localStyles.emptyText}>No active people match those filters.</Text>
          )}

          <TouchableOpacity
            style={localStyles.deactivatedToggle}
            onPress={() => setShowInactiveUsers((current) => !current)}
          >
            <Text style={localStyles.deactivatedToggleText}>
              {showInactiveUsers ? "Hide Deactivated People" : `Show Deactivated People (${inactiveUsers.length})`}
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
                <Text style={localStyles.emptyText}>No deactivated people match those filters.</Text>
              )}
            </View>
          )}
        </View>
      )}

      {activeSection === "invite" && (
        <View style={localStyles.card}>
          <Text style={localStyles.sectionHeading}>Add Person</Text>

          <Text style={localStyles.label}>Name</Text>
          <TextInput
            value={inviteName}
            onChangeText={setInviteName}
            placeholder="Employee name"
            placeholderTextColor="#7b8da0"
            style={localStyles.input}
          />

          <Text style={localStyles.label}>Email</Text>
          <TextInput
            value={inviteEmail}
            onChangeText={setInviteEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="name@bostonpie.com"
            placeholderTextColor="#7b8da0"
            style={localStyles.input}
          />

          <Text style={localStyles.label}>Position</Text>
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
              {isLoading ? "Creating Invite..." : "Create Invite"}
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
              <View>
                <Text style={localStyles.itemTitle}>{item.name}</Text>
                <Text style={localStyles.itemMeta}>Area</Text>
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
            <Text style={localStyles.backButtonText}>‹ Back to People</Text>
          </TouchableOpacity>

          <View style={localStyles.detailHeader}>
            <UserAvatar user={selectedUser} size={58} />
            <View style={localStyles.detailMain}>
              <Text style={localStyles.detailName}>{selectedUser.name}</Text>
              <Text style={localStyles.detailMeta}>{selectedUser.email}</Text>
              <Text style={localStyles.detailMeta}>{formatRole(selectedUser.role)} · {selectedUser.area || "Company"}</Text>
            </View>
          </View>

          <Text style={localStyles.label}>Position</Text>
          <PillGrid options={roles} selectedValue={selectedUser.role} onSelect={handleChangeRole} />

          {shouldShowPrimaryStoreControls(selectedUser.role) && (
            <>
              <Text style={localStyles.label}>Primary Store</Text>
              <PillGrid
                options={stores.map((store) => ({
                  label: `Store ${store.store_number}`,
                  value: store.store_number,
                }))}
                selectedValue={selectedUser.store}
                onSelect={(storeNumber) => handleAssignStore("primary", storeNumber)}
              />
            </>
          )}

          {shouldShowOversightControls(selectedUser.role) && (
            <>
              <Text style={localStyles.label}>Oversight Stores</Text>
              <PillGrid
                options={stores.map((store) => ({
                  label: `Store ${store.store_number}`,
                  value: store.store_number,
                }))}
                selectedValue=""
                onSelect={(storeNumber) => handleAssignStore("oversight", storeNumber)}
              />
            </>
          )}

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

          <Text style={localStyles.label}>Current Store Access</Text>

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
            <Text style={localStyles.emptyText}>No store access assigned.</Text>
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
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 16,
  },
  statValue: {
    color: "#10212b",
    fontSize: 30,
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
    borderRadius: 24,
    padding: 7,
    marginBottom: 14,
    flexDirection: "row",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  navPill: {
    flex: 1,
    borderRadius: 17,
    paddingVertical: 11,
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
    borderRadius: 28,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  formCard: {
    backgroundColor: "#07111f",
    borderRadius: 22,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  formTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 12,
  },
  sectionHeading: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: -0.7,
    marginBottom: 14,
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
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: "#10212b",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 14,
  },
  searchInput: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 14,
    color: "#10212b",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 16,
  },
  pillGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
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
    gap: 10,
    marginBottom: 18,
  },
  miniStat: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 18,
    padding: 14,
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
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
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
    fontSize: 16,
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
    marginTop: 10,
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
    marginTop: 12,
  },
  qrWrap: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 16,
    alignSelf: "center",
    marginBottom: 14,
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
    marginTop: 10,
    lineHeight: 17,
  },
  inviteCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 16,
    marginTop: 16,
  },
  inviteTitle: {
    color: "#10212b",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 4,
  },
  inviteText: {
    color: "#526273",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
    fontWeight: "700",
  },
  inviteUrlBox: {
    backgroundColor: "#eef5f8",
    borderRadius: 15,
    padding: 12,
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
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  simpleRow: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
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
    gap: 14,
    alignItems: "center",
    marginBottom: 20,
  },
  detailAvatar: {
    width: 58,
    height: 58,
    borderRadius: 22,
    backgroundColor: "#e91f3f",
    alignItems: "center",
    justifyContent: "center",
  },
  detailAvatarText: {
    color: "#ffffff",
    fontSize: 22,
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
  resendInviteBlock: {
    marginBottom: 18,
  },
  resendResultCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 14,
    marginTop: 12,
  },
  resendResultTitle: {
    color: "#10212b",
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 4,
  },
  resendResultText: {
    color: "#526273",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    marginBottom: 10,
  },
  assignmentRow: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  backButton: {
    marginBottom: 14,
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
    marginBottom: 12,
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
});
