import { useMemo, useState } from "react";
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

export function BroadcastScreen({ user, threads = [], onSendUpdate }) {
  const availableGroups = useMemo(() => {
    return threads
      .filter((thread) => thread.type !== "direct")
      .map((thread) => ({
        id: thread.id,
        label: thread.name,
        description: thread.subtitle || formatThreadType(thread.type),
        threadId: thread.id,
        threadGroupKey: thread.groupKey,
        type: thread.type,
        memberCount: thread.members?.length || 0,
      }));
  }, [threads]);

  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [requiresAck, setRequiresAck] = useState(false);

  const selectedGroup =
    availableGroups.find((group) => group.id === selectedGroupId) ||
    availableGroups[0];

  function handleSend() {
    if (!selectedGroup || !title.trim() || !body.trim()) return;

    onSendUpdate({
      title: title.trim(),
      body: body.trim(),
      targetGroup: selectedGroup,
      requiresAck,
    });

    setTitle("");
    setBody("");
    setRequiresAck(false);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <HeaderBlock
        eyebrow="SEND"
        title="Send Update"
        subtitle={`${user.role} access · post into a real group chat.`}
      />

      <View style={localStyles.card}>
        <Text style={localStyles.label}>Group thread</Text>

        {availableGroups.length ? (
          <View style={localStyles.groupGrid}>
            {availableGroups.map((group) => {
              const isSelected = selectedGroup?.id === group.id;

              return (
                <TouchableOpacity
                  key={group.id}
                  style={[localStyles.groupChip, isSelected && localStyles.groupChipActive]}
                  onPress={() => setSelectedGroupId(group.id)}
                  activeOpacity={0.84}
                >
                  <View style={localStyles.groupHeader}>
                    <Text
                      style={[
                        localStyles.groupChipTitle,
                        isSelected && localStyles.groupChipTitleActive,
                      ]}
                    >
                      {group.label}
                    </Text>

                    <Text style={[localStyles.typePill, isSelected && localStyles.typePillActive]}>
                      {formatThreadType(group.type)}
                    </Text>
                  </View>

                  <Text
                    style={[
                      localStyles.groupChipText,
                      isSelected && localStyles.groupChipTextActive,
                    ]}
                  >
                    {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={localStyles.emptyCard}>
            <Text style={localStyles.emptyTitle}>No groups yet</Text>
            <Text style={localStyles.emptyText}>
              Create a group in Admin first, then come back to send updates.
            </Text>
          </View>
        )}
      </View>

      <View style={localStyles.card}>
        <Text style={localStyles.label}>Subject</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Example: Weekend operations reminder"
          placeholderTextColor="#7b8da0"
          style={localStyles.input}
        />

        <Text style={localStyles.label}>Message</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Write the update..."
          placeholderTextColor="#7b8da0"
          style={[localStyles.input, localStyles.textArea]}
          multiline
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[localStyles.ackRow, requiresAck && localStyles.ackRowActive]}
          onPress={() => setRequiresAck((current) => !current)}
          activeOpacity={0.84}
        >
          <View style={[localStyles.checkCircle, requiresAck && localStyles.checkCircleActive]}>
            <Text style={localStyles.checkText}>{requiresAck ? "✓" : ""}</Text>
          </View>

          <View style={localStyles.ackMain}>
            <Text style={localStyles.ackTitle}>Needs Response</Text>
            <Text style={localStyles.ackText}>
              Ask team members to acknowledge this update.
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.primaryButton,
            (!selectedGroup || !title.trim() || !body.trim()) && localStyles.disabledButton,
          ]}
          onPress={handleSend}
          disabled={!selectedGroup || !title.trim() || !body.trim()}
          activeOpacity={0.86}
        >
          <Text style={styles.primaryButtonText}>Post to Group</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function formatThreadType(type) {
  const labels = {
    company: "Company",
    store: "Store",
    area: "Area",
    group: "Group",
  };

  return labels[type] || "Group";
}

const localStyles = StyleSheet.create({
  card: {
    backgroundColor: "#101d2d",
    borderRadius: 18,
    padding: 12,
    marginBottom: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  label: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  groupGrid: {
    gap: 5,
  },
  groupChip: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 20,
    padding: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  groupChipActive: {
    backgroundColor: "#e91f3f",
    borderColor: "#e91f3f",
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 5,
    marginBottom: 6,
  },
  groupChipTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
    flex: 1,
  },
  groupChipTitleActive: {
    color: "#ffffff",
  },
  groupChipText: {
    color: "#9cadbf",
    fontSize: 12,
    fontWeight: "800",
  },
  groupChipTextActive: {
    color: "#ffe2e8",
  },
  typePill: {
    color: "#dbe7f3",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  typePillActive: {
    color: "#e91f3f",
    backgroundColor: "#ffffff",
  },
  emptyCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 18,
    padding: 8,
  },
  emptyTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  emptyText: {
    color: "#9cadbf",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 4,
  },
  input: {
    backgroundColor: "#ffffff",
    color: "#10212b",
    borderRadius: 18,
    paddingHorizontal: 9,
    paddingVertical: 13,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 7,
  },
  textArea: {
    minHeight: 126,
  },
  ackRow: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 18,
    padding: 13,
    marginBottom: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  ackRowActive: {
    backgroundColor: "rgba(233,31,63,0.16)",
    borderColor: "rgba(233,31,63,0.42)",
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#8fa1b6",
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleActive: {
    backgroundColor: "#e91f3f",
    borderColor: "#e91f3f",
  },
  checkText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  ackMain: {
    flex: 1,
  },
  ackTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  ackText: {
    color: "#9cadbf",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  disabledButton: {
    opacity: 0.5,
  },
});
