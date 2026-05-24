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

export function BroadcastScreen({ user, threads, onSendUpdate }) {
  const availableTargets = useMemo(() => {
    return threads
      .filter((thread) => thread.type !== "direct")
      .sort((a, b) => {
        const order = {
          company: 1,
          area: 2,
          store: 3,
          role: 4,
          group: 5,
        };

        const orderA = order[a.type] || 99;
        const orderB = order[b.type] || 99;

        if (orderA !== orderB) return orderA - orderB;

        return String(a.name || "").localeCompare(String(b.name || ""));
      });
  }, [threads]);

  const [targetThreadId, setTargetThreadId] = useState(
    availableTargets[0]?.id || ""
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [requiresAck, setRequiresAck] = useState(false);

  const selectedTarget =
    availableTargets.find((thread) => String(thread.id) === String(targetThreadId)) ||
    availableTargets[0];

  function handleSend() {
    if (!selectedTarget || !body.trim()) return;

    onSendUpdate?.({
      title: title.trim() || selectedTarget.name,
      body: body.trim(),
      targetGroup: selectedTarget.id,
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
        subtitle="Post to company, area, store, and role chats."
      />

      <View style={localStyles.card}>
        <Text style={localStyles.sectionTitle}>Target</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={localStyles.targetRow}
        >
          {availableTargets.map((thread) => {
            const isActive = String(selectedTarget?.id) === String(thread.id);

            return (
              <TouchableOpacity
                key={thread.id}
                style={[
                  localStyles.targetPill,
                  isActive && localStyles.targetPillActive,
                ]}
                onPress={() => setTargetThreadId(thread.id)}
                activeOpacity={0.84}
              >
                <Text
                  style={[
                    localStyles.targetType,
                    isActive && localStyles.targetTypeActive,
                  ]}
                >
                  {formatThreadType(thread.type)}
                </Text>
                <Text
                  style={[
                    localStyles.targetName,
                    isActive && localStyles.targetNameActive,
                  ]}
                  numberOfLines={1}
                >
                  {thread.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {!availableTargets.length ? (
          <View style={localStyles.emptyBox}>
            <Text style={localStyles.emptyText}>
              No group chats available yet. Create store/company/role chats first.
            </Text>
          </View>
        ) : null}
      </View>

      <View style={localStyles.card}>
        <Text style={localStyles.sectionTitle}>Message</Text>

        <Text style={localStyles.label}>Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={selectedTarget?.name || "Update title"}
          placeholderTextColor="#7b8da0"
          style={localStyles.input}
        />

        <Text style={localStyles.label}>Message</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Type the update..."
          placeholderTextColor="#7b8da0"
          style={[localStyles.input, localStyles.bodyInput]}
          multiline
        />

        <TouchableOpacity
          style={[localStyles.ackRow, requiresAck && localStyles.ackRowActive]}
          onPress={() => setRequiresAck((current) => !current)}
          activeOpacity={0.84}
        >
          <View style={[localStyles.checkbox, requiresAck && localStyles.checkboxActive]}>
            <Text style={localStyles.checkboxText}>{requiresAck ? "✓" : ""}</Text>
          </View>

          <View style={localStyles.ackTextWrap}>
            <Text style={[localStyles.ackTitle, requiresAck && localStyles.ackTitleActive]}>
              Require acknowledgement
            </Text>
            <Text style={[localStyles.ackSubtitle, requiresAck && localStyles.ackSubtitleActive]}>
              Useful for important updates managers/TMs need to confirm.
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            localStyles.sendButton,
            (!body.trim() || !selectedTarget) && localStyles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!body.trim() || !selectedTarget}
          activeOpacity={0.84}
        >
          <Text style={localStyles.sendButtonText}>
            Send to {selectedTarget?.name || "Group"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={localStyles.previewCard}>
        <Text style={localStyles.previewLabel}>Preview</Text>
        <Text style={localStyles.previewTarget}>
          {selectedTarget ? selectedTarget.name : "No target selected"}
        </Text>
        <Text style={localStyles.previewTitle}>
          {title.trim() || selectedTarget?.name || "Update"}
        </Text>
        <Text style={localStyles.previewBody}>
          {body.trim() || "Your message preview will appear here."}
        </Text>
        {requiresAck ? <Text style={localStyles.previewAck}>ACK REQUIRED</Text> : null}
      </View>
    </ScrollView>
  );
}

function formatThreadType(type) {
  const map = {
    company: "Company",
    area: "Area",
    store: "Store",
    role: "Role",
    group: "Group",
  };

  return map[type] || "Chat";
}

const localStyles = StyleSheet.create({
  card: {
    backgroundColor: "#101d2c",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#203044",
    padding: 9,
    marginBottom: 8,
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 7,
  },
  targetRow: {
    gap: 6,
    paddingRight: 8,
  },
  targetPill: {
    width: 116,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  targetPillActive: {
    backgroundColor: "#ef1745",
    borderColor: "#ef1745",
  },
  targetType: {
    color: "#8fa1b6",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  targetTypeActive: {
    color: "#ffd5dd",
  },
  targetName: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  targetNameActive: {
    color: "#ffffff",
  },
  label: {
    color: "#8fa1b6",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 4,
    marginTop: 5,
  },
  input: {
    backgroundColor: "#0b1624",
    borderWidth: 1,
    borderColor: "#203044",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  bodyInput: {
    minHeight: 92,
    textAlignVertical: "top",
    lineHeight: 18,
  },
  ackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 8,
    marginTop: 8,
  },
  ackRowActive: {
    backgroundColor: "rgba(239,23,69,0.16)",
    borderColor: "rgba(239,23,69,0.6)",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: "#0b1624",
    borderWidth: 1,
    borderColor: "#32465f",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: "#ef1745",
    borderColor: "#ef1745",
  },
  checkboxText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  ackTextWrap: {
    flex: 1,
  },
  ackTitle: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  ackTitleActive: {
    color: "#ffffff",
  },
  ackSubtitle: {
    color: "#8fa1b6",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 1,
  },
  ackSubtitleActive: {
    color: "#ffd5dd",
  },
  sendButton: {
    backgroundColor: "#ef1745",
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 9,
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  sendButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  previewCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 10,
    marginBottom: 10,
  },
  previewLabel: {
    color: "#ef1745",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  previewTarget: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 3,
  },
  previewTitle: {
    color: "#10212b",
    fontSize: 15,
    fontWeight: "900",
  },
  previewBody: {
    color: "#526273",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 4,
  },
  previewAck: {
    alignSelf: "flex-start",
    backgroundColor: "#ffe4e8",
    color: "#991b2f",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 9,
    fontWeight: "900",
    marginTop: 7,
  },
  emptyBox: {
    padding: 8,
  },
  emptyText: {
    color: "#9aacbf",
    fontSize: 12,
    fontWeight: "700",
  },
});
