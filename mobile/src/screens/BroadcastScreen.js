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
import { getVisibleRecipientGroups } from "../data/recipientGroups";

export function BroadcastScreen({ user, onSendBroadcast }) {
  const availableGroups = useMemo(() => getVisibleRecipientGroups(user), [user]);
  const [selectedGroupId, setSelectedGroupId] = useState(
    availableGroups[0]?.id || null
  );
  const [title, setTitle] = useState("Weekend Operations Reminder");
  const [body, setBody] = useState(
    "Please review staffing, image standards, and Load & Go execution before the rush. Reply to your supervisor if you need support."
  );
  const [requiresAck, setRequiresAck] = useState(true);

  const selectedGroup = availableGroups.find((group) => group.id === selectedGroupId);

  function handleSend() {
    if (!selectedGroup || !title.trim() || !body.trim()) return;

    onSendBroadcast({
      title: title.trim(),
      body: body.trim(),
      targetLabel: selectedGroup.label,
      requiresAck,
    });
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <HeaderBlock
        eyebrow="BROADCAST"
        title="Send update"
        subtitle={`${user.role} access · choose who needs to receive this message.`}
      />

      <View style={localStyles.card}>
        <Text style={localStyles.label}>Recipients</Text>

        <View style={localStyles.groupGrid}>
          {availableGroups.map((group) => {
            const isSelected = selectedGroupId === group.id;

            return (
              <TouchableOpacity
                key={group.id}
                style={[localStyles.groupChip, isSelected && localStyles.groupChipActive]}
                onPress={() => setSelectedGroupId(group.id)}
              >
                <Text style={[localStyles.groupChipTitle, isSelected && localStyles.groupChipTitleActive]}>
                  {group.label}
                </Text>
                <Text style={[localStyles.groupChipText, isSelected && localStyles.groupChipTextActive]}>
                  {group.description}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={localStyles.card}>
        <Text style={localStyles.label}>Message title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Enter message title"
          placeholderTextColor="#7b8da0"
          style={localStyles.input}
        />

        <Text style={localStyles.label}>Message body</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Enter message"
          placeholderTextColor="#7b8da0"
          style={[localStyles.input, localStyles.textArea]}
          multiline
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[localStyles.ackToggle, requiresAck && localStyles.ackToggleActive]}
          onPress={() => setRequiresAck((current) => !current)}
        >
          <Text style={[localStyles.ackToggleText, requiresAck && localStyles.ackToggleTextActive]}>
            {requiresAck ? "✓ Requires acknowledgement" : "No acknowledgement required"}
          </Text>
        </TouchableOpacity>

        <View style={localStyles.previewBox}>
          <Text style={localStyles.previewLabel}>Preview</Text>
          <Text style={localStyles.previewTitle}>{title || "Message title"}</Text>
          <Text style={localStyles.previewMeta}>
            To: {selectedGroup?.label || "Choose recipients"}
          </Text>
          <Text style={localStyles.previewBody}>{body || "Message body"}</Text>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handleSend}>
          <Text style={styles.primaryButtonText}>Send Demo Broadcast</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const localStyles = StyleSheet.create({
  card: {
    backgroundColor: "#101d2d",
    borderRadius: 26,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  label: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  groupGrid: {
    gap: 10,
  },
  groupChip: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  groupChipActive: {
    backgroundColor: "#e91f3f",
    borderColor: "#e91f3f",
  },
  groupChipTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 3,
  },
  groupChipTitleActive: {
    color: "#ffffff",
  },
  groupChipText: {
    color: "#9cadbf",
    fontSize: 12,
    fontWeight: "700",
  },
  groupChipTextActive: {
    color: "#ffe2e8",
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
  textArea: {
    minHeight: 120,
    lineHeight: 22,
  },
  ackToggle: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#eef5f8",
    marginBottom: 16,
  },
  ackToggleActive: {
    backgroundColor: "#ecfdf3",
  },
  ackToggleText: {
    color: "#163847",
    fontWeight: "900",
    textAlign: "center",
  },
  ackToggleTextActive: {
    color: "#166534",
  },
  previewBox: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    marginTop: 2,
    marginBottom: 4,
  },
  previewLabel: {
    color: "#e91f3f",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  previewTitle: {
    color: "#10212b",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.6,
    marginBottom: 4,
  },
  previewMeta: {
    color: "#697b8d",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 12,
  },
  previewBody: {
    color: "#263847",
    fontSize: 15,
    lineHeight: 22,
  },
});
