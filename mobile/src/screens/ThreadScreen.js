import { useEffect, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

import { styles } from "../styles/styles";
import { UserAvatar } from "../components/UserAvatar";
import { getThreadBadge } from "../data/threads";
import { setActiveNotificationThreadId } from "../services/pushNotifications";

export function ThreadScreen({
  thread,
  onBack,
  onSendThreadMessage,
  onSendThreadImageMessage,
  onRefreshThread,
  onReact,
  onAcknowledge,
}) {
  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState(null);
  const [pendingImageCaption, setPendingImageCaption] = useState("");
  const scrollViewRef = useRef(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState(null);

  const quickReactions = ["👍", "❤️", "😂", "👀", "✅"];

  useEffect(() => {
    setActiveNotificationThreadId(thread?.id);

    return () => setActiveNotificationThreadId(null);
  }, [thread?.id]);

  // ThreadScreen live refresh interval
  useEffect(() => {
    if (!thread?.id || !onRefreshThread) return undefined;

    onRefreshThread(thread.id);

    const interval = setInterval(() => {
      onRefreshThread(thread.id);
    }, 1000);

    return () => clearInterval(interval);
  }, [thread?.id, onRefreshThread]);

  // auto-scroll to bottom when chat loads or messages update
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 120);

    return () => clearTimeout(timer);
  }, [thread?.id, thread?.messages?.length]);

  function handleSend() {
    if (!draft.trim()) return;
    onSendThreadMessage(thread.id, draft.trim());
    setDraft("");
  }

  async function handlePickImage() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        alert("Photo access is needed to send pictures.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.72,
      });

      if (result.canceled || !result.assets?.[0]?.uri) {
        return;
      }

      const asset = result.assets[0];

      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: "base64",
      });

      const mimeType = asset.mimeType || "image/jpeg";
      const imageData = `data:${mimeType};base64,${base64}`;

      setPendingImage({
        uri: asset.uri,
        imageData,
        mimeType,
        fileName: asset.fileName || "chat-image.jpg",
      });
      setPendingImageCaption("");
    } catch (error) {
      alert(error.message || "Could not choose picture.");
    }
  }

  async function handleSendPendingImage() {
    if (!pendingImage) return;

    try {
      await onSendThreadImageMessage?.(
        thread.id,
        pendingImage.imageData,
        pendingImageCaption.trim(),
        {
          mimeType: pendingImage.mimeType,
          fileName: pendingImage.fileName,
        }
      );

      setPendingImage(null);
      setPendingImageCaption("");
    } catch (error) {
      alert(error.message || "Could not send picture.");
    }
  }

  function handleCancelPendingImage() {
    setPendingImage(null);
    setPendingImageCaption("");
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

          {thread.messages.map((message, index) => (
            <View
              key={message.id}
              style={[
                localStyles.bubbleRow,
                message.isMe ? localStyles.bubbleRowMe : localStyles.bubbleRowOther,
              ]}
            >
              {shouldShowSenderName(thread.messages, message, index) ? (
                <Text style={[localStyles.senderName, message.isMe && localStyles.senderNameMe]}>
                  {message.sender} · {message.senderRole}
                </Text>
              ) : null}

              <TouchableOpacity
                style={[
                  localStyles.bubble,
                  message.isMe ? localStyles.bubbleMe : localStyles.bubbleOther,
                ]}
                activeOpacity={0.9}
                onLongPress={() => setReactionPickerMessageId(message.id)}
                onPress={() =>
                  setReactionPickerMessageId(
                    reactionPickerMessageId === message.id ? null : message.id
                  )
                }
              >
                {message.attachments?.map((attachment) =>
                  attachment.file_type === "image" ? (
                    <Image
                      key={attachment.id}
                      source={{ uri: attachment.url }}
                      style={localStyles.messageImage}
                      resizeMode="cover"
                    />
                  ) : null
                )}

                {message.body && message.body !== "Photo" ? (
                  <Text
                    style={[
                      localStyles.bubbleText,
                      message.isMe ? localStyles.bubbleTextMe : localStyles.bubbleTextOther,
                    ]}
                  >
                    {message.body}
                  </Text>
                ) : null}
                {message.reactions?.length ? (
                  <View style={localStyles.reactionSummaryRow}>
                    {message.reactions.map((reaction) => (
                      <TouchableOpacity
                        key={reaction.emoji}
                        style={[
                          localStyles.reactionSummaryChip,
                          reaction.reacted_by_me && localStyles.reactionSummaryChipActive,
                        ]}
                        onPress={() => onReact?.(message.id, reaction.emoji)}
                        activeOpacity={0.85}
                      >
                        <Text style={localStyles.reactionSummaryText}>
                          {reaction.emoji}{reaction.count > 1 ? ` ${reaction.count}` : ""}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                {reactionPickerMessageId === message.id ? (
                  <View
                    style={[
                      localStyles.iMessageReactionPicker,
                      message.isMe
                        ? localStyles.iMessageReactionPickerMe
                        : localStyles.iMessageReactionPickerOther,
                    ]}
                  >
                    {quickReactions.map((emoji) => (
                      <TouchableOpacity
                        key={emoji}
                        style={localStyles.iMessageReactionButton}
                        onPress={() => {
                          onReact?.(message.id, emoji);
                          setReactionPickerMessageId(null);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={localStyles.iMessageReactionText}>{emoji}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </TouchableOpacity>

              <Text style={localStyles.messageTime}>{message.time}</Text>
            </View>
          ))}
        </ScrollView>

        {pendingImage ? (
          <View style={localStyles.pendingImagePanel}>
            <Image
              source={{ uri: pendingImage.uri }}
              style={localStyles.pendingImagePreview}
              resizeMode="cover"
            />

            <TextInput
              value={pendingImageCaption}
              onChangeText={setPendingImageCaption}
              placeholder="Add a caption..."
              placeholderTextColor="#8a8a8e"
              style={localStyles.pendingCaptionInput}
              multiline
            />

            <View style={localStyles.pendingImageActions}>
              <TouchableOpacity
                style={localStyles.pendingCancelButton}
                onPress={handleCancelPendingImage}
              >
                <Text style={localStyles.pendingCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={localStyles.pendingSendButton}
                onPress={handleSendPendingImage}
              >
                <Text style={localStyles.pendingSendText}>Send Photo</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={localStyles.composer}>
          <TouchableOpacity style={localStyles.photoButton} onPress={handlePickImage}>
            <Text style={localStyles.photoButtonText}>＋</Text>
          </TouchableOpacity>

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

function shouldShowSenderName(messages, message, index) {
  const previousMessage = messages[index - 1];

  if (!previousMessage) return true;

  return (
    previousMessage.sender !== message.sender ||
    previousMessage.isMe !== message.isMe
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
  messageImage: {
    width: 230,
    height: 230,
    borderRadius: 22,
    marginBottom: 6,
    backgroundColor: "#d1d5db",
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
  pendingImagePanel: {
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#d8d8dd",
    padding: 12,
    gap: 10,
  },
  pendingImagePreview: {
    width: 170,
    height: 170,
    borderRadius: 18,
    alignSelf: "center",
    backgroundColor: "#d1d5db",
  },
  pendingCaptionInput: {
    backgroundColor: "#f2f2f7",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#10212b",
    fontSize: 15,
    maxHeight: 90,
  },
  pendingImageActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  pendingCancelButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#e5e7eb",
  },
  pendingCancelText: {
    color: "#526273",
    fontSize: 13,
    fontWeight: "900",
  },
  pendingSendButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#007aff",
  },
  pendingSendText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
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
  photoButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#d1d1d6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  photoButtonText: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 27,
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
  reactionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
    alignItems: "center",
  },
  quickReactionButton: {
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minWidth: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  quickReactionButtonActive: {
    backgroundColor: "#ffffff",
  },
  quickReactionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  quickReactionTextActive: {
    color: "#10212b",
  },
  reactionSummaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 6,
    alignSelf: "flex-start",
  },
  reactionSummaryChip: {
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  reactionSummaryChipActive: {
    backgroundColor: "#ffffff",
  },
  reactionSummaryText: {
    fontSize: 12,
    fontWeight: "900",
  },
  iMessageReactionPicker: {
    position: "absolute",
    top: -44,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    zIndex: 20,
  },
  iMessageReactionPickerMe: {
    right: 8,
  },
  iMessageReactionPickerOther: {
    left: 8,
  },
  iMessageReactionButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  iMessageReactionText: {
    fontSize: 22,
  },
});
