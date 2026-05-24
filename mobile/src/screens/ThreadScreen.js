import { useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";

import { styles } from "../styles/styles";
import { UserAvatar } from "../components/UserAvatar";
import { getThreadBadge } from "../data/threads";

export function ThreadScreen({ thread, onBack, onSendThreadMessage, onReact }) {
  const [draft, setDraft] = useState("");

  function handleSend() {
    if (!draft.trim()) return;
    onSendThreadMessage(thread.id, draft.trim());
    setDraft("");
  }

  return (
    <SafeAreaView style={localStyles.safe}>
      <StatusBar style="dark" />

      <KeyboardAvoidingView
        style={localStyles.keyboardWrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={localStyles.header}>
          <TouchableOpacity style={localStyles.backButton} onPress={onBack}>
            <Text style={localStyles.backText}>‹</Text>
          </TouchableOpacity>

          <ThreadHeaderAvatar thread={thread} />

          <View style={localStyles.headerMain}>
            <Text style={localStyles.headerName}>{thread.name}</Text>
            <Text style={localStyles.headerSub}>{thread.subtitle}</Text>
          </View>
        </View>

        <ScrollView style={localStyles.chatArea} contentContainerStyle={localStyles.chatContent}>
          <View style={localStyles.threadInfo}>
            <Text style={localStyles.threadInfoTitle}>{thread.name}</Text>
            <Text style={localStyles.threadInfoText}>
              {(thread.memberNames || thread.members?.map((member) => member.name) || []).join(", ")}
            </Text>
          </View>

          {thread.messages.map((message) => (
            <View
              key={message.id}
              style={[
                localStyles.bubbleRow,
                message.isMe ? localStyles.bubbleRowMe : localStyles.bubbleRowOther,
              ]}
            >
              <Text
                style={[
                  localStyles.senderName,
                  message.isMe && localStyles.senderNameMe,
                ]}
              >
                {message.sender} · {message.senderRole}
              </Text>

              <View
                style={[
                  localStyles.bubble,
                  message.isMe ? localStyles.bubbleMe : localStyles.bubbleOther,
                ]}
              >
                <Text
                  style={[
                    localStyles.bubbleText,
                    message.isMe ? localStyles.bubbleTextMe : localStyles.bubbleTextOther,
                  ]}
                >
                  {message.body}
                </Text>
              </View>

              <Text style={localStyles.messageTime}>{message.time}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={localStyles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="iMessage"
            placeholderTextColor="#8a8a8e"
            style={localStyles.input}
            multiline
          />

          <TouchableOpacity
            style={[localStyles.sendButton, !draft.trim() && localStyles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!draft.trim()}
          >
            <Text style={localStyles.sendText}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ThreadHeaderAvatar({ thread }) {
  if (thread.type === "direct" && thread.members?.length) {
    const otherMember = thread.members[0];
    return <UserAvatar user={otherMember} name={thread.name} size={46} />;
  }

  return (
    <View style={localStyles.headerAvatar}>
      <Text style={localStyles.headerAvatarText}>
        {getThreadBadge(thread.type)}
      </Text>
    </View>
  );
}

const localStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f2f2f7",
  },
  keyboardWrap: {
    flex: 1,
  },
  header: {
    height: 74,
    backgroundColor: "rgba(248,248,248,0.96)",
    borderBottomWidth: 1,
    borderBottomColor: "#d8d8dd",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 10,
  },
  backButton: {
    width: 34,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    color: "#007aff",
    fontSize: 42,
    lineHeight: 42,
    fontWeight: "300",
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: "#c7c7cc",
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 12,
  },
  headerMain: {
    flex: 1,
  },
  headerName: {
    color: "#111111",
    fontSize: 16,
    fontWeight: "800",
  },
  headerSub: {
    color: "#6e6e73",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  chatArea: {
    flex: 1,
    backgroundColor: "#f2f2f7",
  },
  chatContent: {
    padding: 14,
    paddingBottom: 20,
  },
  threadInfo: {
    alignItems: "center",
    marginBottom: 18,
    paddingHorizontal: 20,
  },
  threadInfoTitle: {
    color: "#111111",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 4,
  },
  threadInfoText: {
    color: "#6e6e73",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 17,
  },
  bubbleRow: {
    marginBottom: 10,
    maxWidth: "82%",
  },
  bubbleRowMe: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  bubbleRowOther: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
  },
  senderNameMe: {
    alignSelf: "flex-end",
    textAlign: "right",
  },
  senderName: {
    color: "#6e6e73",
    fontSize: 11,
    marginLeft: 8,
    marginBottom: 3,
    fontWeight: "700",
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  bubbleMe: {
    backgroundColor: "#007aff",
    borderBottomRightRadius: 5,
  },
  bubbleOther: {
    backgroundColor: "#e5e5ea",
    borderBottomLeftRadius: 5,
  },
  bubbleText: {
    fontSize: 16,
    lineHeight: 22,
  },
  bubbleTextMe: {
    color: "#ffffff",
  },
  bubbleTextOther: {
    color: "#111111",
  },
  messageTime: {
    color: "#8a8a8e",
    fontSize: 10,
    marginTop: 3,
    marginHorizontal: 8,
    fontWeight: "600",
  },
  composer: {
    backgroundColor: "#f8f8f8",
    borderTopWidth: 1,
    borderTopColor: "#d8d8dd",
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 100,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d1d1d6",
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: "#111111",
    fontSize: 16,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: "#007aff",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#c7c7cc",
  },
  sendText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 24,
  },
  reactionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
    alignItems: "center",
  },
  reactionChip: {
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  reactionChipActive: {
    backgroundColor: "#ffffff",
    borderColor: "#ffffff",
  },
  reactionText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  reactionTextActive: {
    color: "#10212b",
  },
  quickReactButton: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 999,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  quickReactText: {
    fontSize: 14,
  },
});
