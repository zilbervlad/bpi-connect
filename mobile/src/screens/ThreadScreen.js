import { useEffect, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  StyleSheet,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

import { styles } from "../styles/styles";
import { UserAvatar } from "../components/UserAvatar";
import { getThreadBadge } from "../data/threads";
import { setActiveNotificationThreadId } from "../services/pushNotifications";

function getSeenStatusText(message) {
  const seenByCount = Number(message.seenByCount || 0);
  const deliveredToCount = Number(message.deliveredToCount || 0);

  if (!message.isMe || message.status === "sending" || message.status === "failed") {
    return "";
  }

  if (seenByCount > 0) {
    return seenByCount === 1 ? "Seen" : `Seen by ${seenByCount}`;
  }

  if (deliveredToCount > 0) {
    return deliveredToCount === 1 ? "Delivered" : `Delivered to ${deliveredToCount}`;
  }

  return "Sent";
}

export function ThreadScreen({
  thread,
  user,
  onBack,
  onSendThreadMessage,
  onSendThreadImageMessage,
  onRetryThreadMessage,
  onDeleteThreadMessage,
  onRefreshThread,
  onReact,
  onAcknowledge,
  onManageThread,
}) {
  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState(null);
  const [pendingImageCaption, setPendingImageCaption] = useState("");
  const currentUserRole = String(user?.role || "").toLowerCase();
  const canManageThread = ["admin", "hr", "coach"].includes(currentUserRole) && thread.type !== "direct";

  function isDeletedMessage(message) {
    return Boolean(message?.deleted) || String(message?.body || "") === "This message was deleted";
  }

  function canDeleteMessage(message) {
    if (!message?.id || String(message.id).startsWith("pending-")) return false;
    if (isDeletedMessage(message)) return false;
    if (message.isMe) return true;

    return ["admin", "hr"].includes(currentUserRole);
  }

  function confirmDeleteMessage(message) {
    Alert.alert(
      "Delete Message?",
      "This will remove the message content from the chat. A deleted-message note will remain.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDeleteThreadMessage?.(message.id),
        },
      ]
    );
  }

  const messageListRef = useRef(null);
  const previousMessageCountRef = useRef(thread?.messages?.length || 0);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  const quickReactions = ["👍", "❤️", "😂", "👀", "✅"];
  const unreadAtOpen = Number(thread.unreadAtOpen || 0);
  const unreadStartIndex =
    unreadAtOpen > 0
      ? Math.max((thread.messages || []).length - unreadAtOpen, 0)
      : -1;

  function scrollToLatest(animated = true) {
    requestAnimationFrame(() => {
      messageListRef.current?.scrollToEnd({ animated });
    });
  }

  function handleChatScroll(event) {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (layoutMeasurement.height + contentOffset.y);

    const nearBottom = distanceFromBottom < 90;
    setIsNearBottom(nearBottom);

    if (nearBottom) {
      setHasNewMessages(false);
    }
  }

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
    }, 15000);

    return () => clearInterval(interval);
  }, [thread?.id, onRefreshThread]);

  // Land on latest when opening a thread
  useEffect(() => {
    previousMessageCountRef.current = thread?.messages?.length || 0;
    setIsNearBottom(true);
    setHasNewMessages(false);

    const timer = setTimeout(() => {
      scrollToLatest(false);
    }, 150);

    return () => clearTimeout(timer);
  }, [thread?.id]);

  // New messages: auto-scroll only if user is already near bottom
  useEffect(() => {
    const currentCount = thread?.messages?.length || 0;
    const previousCount = previousMessageCountRef.current;
    const messageAdded = currentCount > previousCount;

    previousMessageCountRef.current = currentCount;

    if (!messageAdded) return;

    if (isNearBottom) {
      setHasNewMessages(false);
      setTimeout(() => scrollToLatest(true), 80);
    } else {
      setHasNewMessages(true);
    }
  }, [thread?.messages?.length, isNearBottom]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      setTimeout(() => {
        scrollToLatest(true);
      }, 100);
    });

    return () => {
      showSubscription.remove();
    };
  }, []);

  function handleSend() {
    const messageToSend = draft.trim();
    if (!messageToSend) return;

    setDraft("");
    setIsNearBottom(true);
    setHasNewMessages(false);

    scrollToLatest(true);

    requestAnimationFrame(() => {
      onSendThreadMessage?.(thread.id, messageToSend);

      setTimeout(() => scrollToLatest(true), 40);
      setTimeout(() => scrollToLatest(true), 160);
    });
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

    const imageToSend = pendingImage;
    const captionToSend = pendingImageCaption.trim();

    setPendingImage(null);
    setPendingImageCaption("");

    try {
      await onSendThreadImageMessage?.(
        thread.id,
        imageToSend.imageData,
        captionToSend,
        {
          mimeType: imageToSend.mimeType,
          fileName: imageToSend.fileName,
          previewUri: imageToSend.uri,
        }
      );
    } catch (error) {
      alert(error.message || "Could not send picture.");
    }
  }

  function handleCancelPendingImage() {
    setPendingImage(null);
    setPendingImageCaption("");
  }

  function renderMessage({ item: message, index }) {
    const isLastInGroup = isLastMessageInGroup(thread.messages, message, index);
    const groupedBubbleStyle = getBubbleGroupStyle(thread.messages, message, index);

    return (
      <View>
        {shouldShowDateDivider(thread.messages, message, index) ? (
          <View style={localStyles.dateDivider}>
            <Text style={localStyles.dateDividerText}>{getMessageDateLabel(message)}</Text>
          </View>
        ) : null}

        {index === unreadStartIndex ? (
          <View style={localStyles.unreadDivider}>
            <View style={localStyles.unreadDividerLine} />
            <Text style={localStyles.unreadDividerText}>Unread messages</Text>
            <View style={localStyles.unreadDividerLine} />
          </View>
        ) : null}

        <View
          style={[
            localStyles.bubbleRow,
            message.isMe ? localStyles.bubbleRowMe : localStyles.bubbleRowOther,
          ]}
        >
          {shouldShowSenderName(thread.messages, message, index) ? (
            <Text style={[localStyles.senderName, message.isMe && localStyles.senderNameMe]}>
              {formatSenderLabel(message)}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[
              localStyles.bubble,
              message.isMe ? localStyles.bubbleMe : localStyles.bubbleOther,
              groupedBubbleStyle,
            ]}
            activeOpacity={0.9}
            onLongPress={() => {
              if (canDeleteMessage(message)) {
                confirmDeleteMessage(message);
                return;
              }

              setReactionPickerMessageId(message.id);
            }}
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
                  source={{ uri: attachment.url || attachment.localUri }}
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
                  isDeletedMessage(message) && localStyles.deletedMessageText,
                ]}
              >
                {message.body}
              </Text>
            ) : null}

            {message.isMe && message.status === "sending" ? (
              <Text style={localStyles.messageStatusText}>Sending…</Text>
            ) : null}

            {message.isMe && message.status === "failed" ? (
              <TouchableOpacity
                onPress={() => onRetryThreadMessage?.(thread.id, message)}
                activeOpacity={0.85}
              >
                <Text style={[localStyles.messageStatusText, localStyles.messageStatusFailed]}>
                  Failed — tap to retry
                </Text>
              </TouchableOpacity>
            ) : null}

            {message.isMe && getSeenStatusText(message) ? (
              <Text style={localStyles.messageStatusText}>
                {getSeenStatusText(message)}
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

          {isLastInGroup ? (
            <Text style={localStyles.messageTime}>{message.time}</Text>
          ) : null}
        </View>
      </View>
    );
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

          {canManageThread ? (
            <TouchableOpacity
              style={localStyles.manageButton}
              onPress={() => onManageThread?.(thread.id)}
              activeOpacity={0.85}
            >
              <Text style={localStyles.manageButtonText}>Manage</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <FlatList
          ref={messageListRef}
          data={thread.messages || []}
          keyExtractor={(message) => String(message.id)}
          renderItem={renderMessage}
          style={localStyles.chatArea}
          contentContainerStyle={localStyles.chatContent}
          onScroll={handleChatScroll}
          scrollEventThrottle={80}
          onContentSizeChange={() => {
            if (isNearBottom) {
              scrollToLatest(false);
            }
          }}
          onLayout={() => scrollToLatest(false)}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={24}
          maxToRenderPerBatch={16}
          windowSize={9}
          removeClippedSubviews={Platform.OS !== "ios"}
        />

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

        {hasNewMessages ? (
          <TouchableOpacity
            style={localStyles.newMessagesButton}
            onPress={() => {
              setHasNewMessages(false);
              setIsNearBottom(true);
              scrollToLatest(true);
            }}
            activeOpacity={0.9}
          >
            <Text style={localStyles.newMessagesButtonText}>↓ New messages</Text>
          </TouchableOpacity>
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

function getMessageDateLabel(message) {
  const rawValue = message.createdAt || message.created_at || message.createdAtIso || message.timeRaw;

  if (!rawValue || rawValue === "Now" || rawValue === "API") {
    return null;
  }

  const messageDate = new Date(rawValue);

  if (Number.isNaN(messageDate.getTime())) {
    return null;
  }

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(messageDate, today)) return "Today";
  if (sameDay(messageDate, yesterday)) return "Yesterday";

  return messageDate.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function shouldShowDateDivider(messages, message, index) {
  const currentLabel = getMessageDateLabel(message);

  if (!currentLabel) return false;
  if (index === 0) return true;

  const previousLabel = getMessageDateLabel(messages[index - 1]);
  return currentLabel !== previousLabel;
}

function shouldShowSenderName(messages, message, index) {
  const previousMessage = messages[index - 1];

  if (!previousMessage) return true;

  return (
    previousMessage.sender !== message.sender ||
    previousMessage.isMe !== message.isMe ||
    shouldShowDateDivider(messages, message, index)
  );
}

function isLastMessageInGroup(messages, message, index) {
  const nextMessage = messages[index + 1];

  if (!nextMessage) return true;

  if (shouldShowDateDivider(messages, nextMessage, index + 1)) {
    return true;
  }

  return (
    nextMessage.sender !== message.sender ||
    nextMessage.isMe !== message.isMe
  );
}

function getBubbleGroupStyle(messages, message, index) {
  const previousMessage = messages[index - 1];
  const nextMessage = messages[index + 1];

  const continuesFromPrevious =
    previousMessage &&
    previousMessage.sender === message.sender &&
    previousMessage.isMe === message.isMe &&
    !shouldShowDateDivider(messages, message, index);

  const continuesToNext =
    nextMessage &&
    nextMessage.sender === message.sender &&
    nextMessage.isMe === message.isMe &&
    !shouldShowDateDivider(messages, nextMessage, index + 1);

  if (!continuesFromPrevious && !continuesToNext) return null;

  if (message.isMe) {
    if (continuesFromPrevious && continuesToNext) return localStyles.bubbleMeMiddle;
    if (continuesFromPrevious) return localStyles.bubbleMeLast;
    if (continuesToNext) return localStyles.bubbleMeFirst;
  }

  if (continuesFromPrevious && continuesToNext) return localStyles.bubbleOtherMiddle;
  if (continuesFromPrevious) return localStyles.bubbleOtherLast;
  if (continuesToNext) return localStyles.bubbleOtherFirst;

  return null;
}

function formatSenderLabel(message) {
  const sender = String(message?.sender || "Unknown").trim();
  const role = formatSenderRole(message?.senderRole);

  if (!role) return sender;

  return `${sender} · ${role}`;
}

function formatSenderRole(role) {
  const value = String(role || "").trim().toLowerCase();

  const map = {
    admin: "Admin",
    hr: "HR",
    coach: "Coach",
    supervisor: "Supervisor",
    general_manager: "GM",
    manager: "MIT",
    tm: "TM",
  };

  return map[value] || "";
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
    backgroundColor: "#f6f7fb",
  },
  keyboardWrap: {
    flex: 1,
  },
  header: {
    minHeight: 72,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderBottomWidth: 1,
    borderBottomColor: "#e6e8ef",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
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
  manageButton: {
    backgroundColor: "#eef6ff",
    borderWidth: 1,
    borderColor: "#cfe4ff",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  manageButtonText: {
    color: "#0a84ff",
    fontSize: 12,
    fontWeight: "900",
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: "#dbe3ff",
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarText: {
    color: "#2443a6",
    fontWeight: "900",
    fontSize: 12,
  },
  headerMain: {
    flex: 1,
  },
  headerName: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  headerSub: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  chatArea: {
    flex: 1,
    backgroundColor: "#f6f7fb",
  },
  chatContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 18,
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
  dateDivider: {
    alignSelf: "center",
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  dateDividerText: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  unreadDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 14,
    paddingHorizontal: 10,
  },
  unreadDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#e91f3f",
    opacity: 0.45,
  },
  unreadDividerText: {
    color: "#e91f3f",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  bubbleRow: {
    marginBottom: 8,
    maxWidth: "84%",
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
    color: "#6b7280",
    fontSize: 11,
    marginLeft: 9,
    marginBottom: 3,
    fontWeight: "800",
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 19,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  bubbleMe: {
    backgroundColor: "#0a84ff",
    borderBottomRightRadius: 6,
  },
  bubbleOther: {
    backgroundColor: "#ffffff",
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: "#edf0f5",
  },
  bubbleMeFirst: {
    borderBottomRightRadius: 14,
  },
  bubbleMeMiddle: {
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
  },
  bubbleMeLast: {
    borderTopRightRadius: 14,
    borderBottomRightRadius: 6,
  },
  bubbleOtherFirst: {
    borderBottomLeftRadius: 14,
  },
  bubbleOtherMiddle: {
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  bubbleOtherLast: {
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 6,
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
    letterSpacing: -0.1,
  },
  bubbleTextMe: {
    color: "#ffffff",
  },
  bubbleTextOther: {
    color: "#111827",
  },
  messageTime: {
    color: "#9ca3af",
    fontSize: 10,
    marginTop: 3,
    marginHorizontal: 8,
    fontWeight: "700",
  },
  pendingImagePanel: {
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
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
    backgroundColor: "#f6f7fb",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#111827",
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
  newMessagesButton: {
    alignSelf: "center",
    backgroundColor: "#ef1745",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginBottom: 7,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  newMessagesButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  composer: {
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: Platform.OS === "ios" ? 12 : 9,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  photoButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#eef2f7",
    borderWidth: 1,
    borderColor: "#d8dee8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  photoButtonText: {
    color: "#64748b",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 27,
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 104,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d8dee8",
    backgroundColor: "#f9fafb",
    paddingHorizontal: 14,
    paddingVertical: 7,
    color: "#111827",
    fontSize: 16,
    lineHeight: 21,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#0a84ff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0a84ff",
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  sendButtonDisabled: {
    backgroundColor: "#cbd5e1",
    shadowOpacity: 0,
    elevation: 0,
  },
  sendText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 24,
  },
  messageStatusText: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 5,
    textAlign: "right",
  },
  messageStatusFailed: {
    color: "#ef1745",
  },
  reactionSummaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 6,
    alignSelf: "flex-start",
  },
  reactionSummaryChip: {
    backgroundColor: "rgba(255,255,255,0.78)",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.22)",
  },
  reactionSummaryChipActive: {
    backgroundColor: "#eef6ff",
    borderColor: "#bfdbfe",
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
  deletedMessageText: {
    fontStyle: "italic",
    opacity: 0.72,
  },
});
