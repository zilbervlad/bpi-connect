import { useMemo, useEffect, useState } from "react";
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
import { getVisiblePrivateRecipients } from "../data/privateRecipients";
import { getVisibleApiPeople } from "../api/peoplePermissions";

export function ComposeScreen({
  user,
  users,
  usingApi,
  onSendPrivateMessage,
  startingRecipient,
}) {
  const recipients = useMemo(() => {
    return usingApi
      ? getVisibleApiPeople(user, users)
      : getVisiblePrivateRecipients(user);
  }, [user, users, usingApi]);

  const [selectedRecipientId, setSelectedRecipientId] = useState(
    startingRecipient?.id || recipients[0]?.id || null
  );
  const [messageBody, setMessageBody] = useState("Can you check this and let me know when it is done?");

  useEffect(() => {
    if (startingRecipient?.id) {
      setSelectedRecipientId(startingRecipient.id);
    } else if (!selectedRecipientId && recipients[0]?.id) {
      setSelectedRecipientId(recipients[0].id);
    }
  }, [startingRecipient, recipients, selectedRecipientId]);

  const selectedRecipient = recipients.find((recipient) => recipient.id === selectedRecipientId);

  function handleSend() {
    if (!selectedRecipient || !messageBody.trim()) return;

    onSendPrivateMessage({
      recipient: selectedRecipient,
      body: messageBody.trim(),
    });

    setMessageBody("");
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <HeaderBlock
        eyebrow="PRIVATE MESSAGE"
        title="New message"
        subtitle={`${user.role} access · choose an approved recipient.`}
      />

      <View style={localStyles.card}>
        <Text style={localStyles.label}>Recipients</Text>

        {recipients.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No recipients available</Text>
            <Text style={styles.emptyText}>
              Your role does not currently have private messaging recipients.
            </Text>
          </View>
        ) : (
          <View style={localStyles.recipientList}>
            {recipients.map((recipient) => {
              const isSelected = selectedRecipientId === recipient.id;

              return (
                <TouchableOpacity
                  key={recipient.id}
                  style={[
                    localStyles.recipientChip,
                    isSelected && localStyles.recipientChipActive,
                  ]}
                  onPress={() => setSelectedRecipientId(recipient.id)}
                >
                  <View style={localStyles.avatar}>
                    <Text style={localStyles.avatarText}>
                      {recipient.name.charAt(0)}
                    </Text>
                  </View>

                  <View style={localStyles.recipientTextWrap}>
                    <Text
                      style={[
                        localStyles.recipientName,
                        isSelected && localStyles.recipientNameActive,
                      ]}
                    >
                      {recipient.name}
                    </Text>
                    <Text
                      style={[
                        localStyles.recipientMeta,
                        isSelected && localStyles.recipientMetaActive,
                      ]}
                    >
                      {recipient.role} · {recipient.store}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      <View style={localStyles.card}>
        <Text style={localStyles.label}>Message</Text>

        <TextInput
          value={messageBody}
          onChangeText={setMessageBody}
          placeholder="Write your message..."
          placeholderTextColor="#7b8da0"
          style={localStyles.textArea}
          multiline
          textAlignVertical="top"
        />

        <View style={localStyles.previewBox}>
          <Text style={localStyles.previewLabel}>Preview</Text>
          <Text style={localStyles.previewTitle}>
            To: {selectedRecipient?.name || "Choose recipient"}
          </Text>
          <Text style={localStyles.previewMeta}>
            Private message from {user.name}
          </Text>
          <Text style={localStyles.previewBody}>
            {messageBody || "Message body"}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.primaryButton,
            (!selectedRecipient || !messageBody.trim()) && localStyles.disabledButton,
          ]}
          onPress={handleSend}
          disabled={!selectedRecipient || !messageBody.trim()}
        >
          <Text style={styles.primaryButtonText}>Send Demo Message</Text>
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
  recipientList: {
    gap: 10,
  },
  recipientChip: {
    borderRadius: 18,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  recipientChipActive: {
    backgroundColor: "#e91f3f",
    borderColor: "#e91f3f",
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 16,
  },
  recipientTextWrap: {
    flex: 1,
  },
  recipientName: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 3,
  },
  recipientNameActive: {
    color: "#ffffff",
  },
  recipientMeta: {
    color: "#9cadbf",
    fontSize: 12,
    fontWeight: "700",
  },
  recipientMetaActive: {
    color: "#ffe2e8",
  },
  textArea: {
    minHeight: 130,
    backgroundColor: "#07111f",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 22,
    marginBottom: 16,
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
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.5,
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
  disabledButton: {
    opacity: 0.45,
  },
});
