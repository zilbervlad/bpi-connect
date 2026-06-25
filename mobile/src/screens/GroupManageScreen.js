import { useMemo, useState } from "react";
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { styles } from "../styles/styles";
import { UserAvatar } from "../components/UserAvatar";

function normalizeRole(role) {
  const value = String(role || "").toLowerCase();

  const map = {
    admin: "Admin",
    hr: "HR",
    coach: "Coach",
    supervisor: "Supervisor",
    general_manager: "GM",
    manager: "MIT",
    tm: "TM",
  };

  return map[value] || role || "User";
}

function getMemberIds(thread) {
  return new Set((thread?.members || []).map((member) => String(member.id)));
}

export function GroupManageScreen({
  thread,
  user,
  users = [],
  onBack,
  onRenameThread,
  onAddMember,
  onDeleteMember,
  onDeleteThread,
}) {
  const [name, setName] = useState(thread?.name || "");
  const [searchText, setSearchText] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const currentRole = String(user?.role || "").toLowerCase();
  const canManage = ["admin", "hr", "coach"].includes(currentRole);
  const memberIds = getMemberIds(thread);

  const availableUsers = useMemo(() => {
    const search = searchText.trim().toLowerCase();

    return (users || [])
      .filter((item) => item?.is_active !== false)
      .filter((item) => !memberIds.has(String(item.id)))
      .filter((item) => {
        if (!search) return true;

        return (
          String(item.name || "").toLowerCase().includes(search) ||
          String(item.email || "").toLowerCase().includes(search) ||
          String(item.store || "").toLowerCase().includes(search) ||
          String(item.area || "").toLowerCase().includes(search) ||
          String(item.role || "").toLowerCase().includes(search)
        );
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }, [users, memberIds, searchText]);

  async function handleSaveName() {
    const nextName = name.trim();

    if (!nextName) {
      Alert.alert("Group name required", "Enter a group name first.");
      return;
    }

    setIsSaving(true);
    try {
      await onRenameThread?.(thread.id, nextName);
      Alert.alert("Saved", "Group name updated.");
    } catch (error) {
      Alert.alert("Could not save", error.message || "Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function confirmRemoveMember(member) {
    Alert.alert(
      "Remove person?",
      `Remove ${member.name || "this person"} from ${thread.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => onRemoveMember?.(thread.id, member.id),
        },
      ]
    );
  }

  function confirmDeleteThread() {
    Alert.alert(
      "Delete group?",
      "This deletes the group for everyone. Members and chat history for this group will be removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => onDeleteThread?.(thread.id),
        },
      ]
    );
  }

  return (
    <SafeAreaView style={localStyles.safe}>
      <View style={localStyles.header}>
        <TouchableOpacity style={localStyles.backButton} onPress={onBack}>
          <Text style={localStyles.backText}>‹</Text>
        </TouchableOpacity>

        <View style={localStyles.headerMain}>
          <Text style={localStyles.eyebrow}>MANAGE GROUP</Text>
          <Text style={localStyles.title}>{thread?.name || "Group"}</Text>
          <Text style={localStyles.subtitle}>
            {(thread?.members || []).length} {(thread?.members || []).length === 1 ? "member" : "members"}
          </Text>
        </View>
      </View>

      <ScrollView style={localStyles.body} contentContainerStyle={localStyles.content}>
        {!canManage ? (
          <View style={localStyles.card}>
            <Text style={localStyles.cardTitle}>Members</Text>
            <Text style={localStyles.helperText}>
              You can view this group, but only Admin, HR, or Coach users can edit it.
            </Text>
          </View>
        ) : null}

        <View style={localStyles.card}>
          <Text style={localStyles.cardTitle}>Group Name</Text>

          <TextInput
            value={name}
            onChangeText={setName}
            editable={canManage}
            placeholder="Group name"
            placeholderTextColor="#7b8da0"
            style={localStyles.input}
          />

          {canManage ? (
            <TouchableOpacity
              style={[styles.primaryButton, isSaving && localStyles.disabledButton]}
              disabled={isSaving}
              onPress={handleSaveName}
            >
              <Text style={styles.primaryButtonText}>{isSaving ? "Saving..." : "Save Name"}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={localStyles.card}>
          <Text style={localStyles.cardTitle}>Current Members</Text>

          {(thread?.members || []).length ? (
            thread.members.map((member) => {
              const isSelf = String(member.id) === String(user?.id);

              return (
                <View key={member.id} style={localStyles.memberRow}>
                  <UserAvatar user={member} size={34} />
                  <View style={localStyles.memberMain}>
                    <Text style={localStyles.memberName}>{member.name}</Text>
                    <Text style={localStyles.memberMeta}>
                      {normalizeRole(member.role)} · {member.store || member.area || "Company"}
                    </Text>
                  </View>

                  {canManage && !isSelf ? (
                    <TouchableOpacity
                      style={localStyles.removeButton}
                      onPress={() => confirmRemoveMember(member)}
                    >
                      <Text style={localStyles.removeButtonText}>Remove</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })
          ) : (
            <Text style={localStyles.emptyText}>No members found.</Text>
          )}
        </View>

        {canManage ? (
          <View style={localStyles.card}>
            <Text style={localStyles.cardTitle}>Add People</Text>

            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search name, role, store..."
              placeholderTextColor="#7b8da0"
              style={localStyles.input}
            />

            {availableUsers.length ? (
              availableUsers.slice(0, 80).map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={localStyles.addRow}
                  onPress={() => onAddMember?.(thread.id, item.id)}
                >
                  <UserAvatar user={item} size={34} />
                  <View style={localStyles.memberMain}>
                    <Text style={localStyles.memberName}>{item.name}</Text>
                    <Text style={localStyles.memberMeta}>
                      {normalizeRole(item.role)} · {item.store || item.area || "Company"}
                    </Text>
                  </View>
                  <Text style={localStyles.addText}>+</Text>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={localStyles.emptyText}>No available people found.</Text>
            )}
          </View>
        ) : null}

        {canManage ? (
          <View style={localStyles.card}>
            <Text style={localStyles.cardTitle}>Danger Zone</Text>
            <TouchableOpacity style={localStyles.dangerButton} onPress={confirmDeleteThread}>
              <Text style={localStyles.dangerButtonText}>Delete Group For Everyone</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f6f7fb",
  },
  header: {
    minHeight: 76,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderBottomWidth: 1,
    borderBottomColor: "#e6e8ef",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  backButton: {
    width: 34,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    color: "#0a84ff",
    fontSize: 38,
    lineHeight: 40,
    fontWeight: "300",
  },
  headerMain: {
    flex: 1,
  },
  eyebrow: {
    color: "#7b8da0",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  title: {
    color: "#152033",
    fontSize: 20,
    fontWeight: "900",
  },
  subtitle: {
    color: "#6b778c",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  body: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 14,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e6e8ef",
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardTitle: {
    color: "#152033",
    fontSize: 16,
    fontWeight: "900",
  },
  helperText: {
    color: "#6b778c",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  input: {
    backgroundColor: "#f6f7fb",
    borderWidth: 1,
    borderColor: "#dbe2ea",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#152033",
    fontSize: 15,
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.65,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eef1f6",
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eef1f6",
  },
  memberMain: {
    flex: 1,
  },
  memberName: {
    color: "#152033",
    fontSize: 14,
    fontWeight: "900",
  },
  memberMeta: {
    color: "#7b8da0",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  removeButton: {
    backgroundColor: "#fff1f2",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  removeButtonText: {
    color: "#e11d48",
    fontSize: 12,
    fontWeight: "900",
  },
  addText: {
    color: "#0a84ff",
    fontSize: 26,
    fontWeight: "900",
    paddingHorizontal: 8,
  },
  dangerButton: {
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: "center",
  },
  dangerButtonText: {
    color: "#e11d48",
    fontSize: 14,
    fontWeight: "900",
  },
  emptyText: {
    color: "#7b8da0",
    fontSize: 13,
    fontWeight: "700",
  },
});
