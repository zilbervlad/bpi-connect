import { useEffect, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  FlatList,
  TextInput,
  StyleSheet,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActionSheetIOS,
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
  onPinThreadMessage,
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

  function canPinMessage(message) {
    if (!canManageThread) return false;
    if (!message?.id || String(message.id).startsWith("pending-")) return false;
    if (isDeletedMessage(message)) return false;
    return true;
  }

  function isPinnedMessage(message) {
    return String(thread?.pinnedMessage?.id || thread?.pinned_message?.id || "") === String(message?.id || "");
  }

  function getPinnedMessage() {
    return thread?.pinnedMessage || thread?.pinned_message || null;
  }

  function formatSeenUserList(users = []) {
    if (!users.length) return "No one has seen this yet.";

    return users
      .map((item) => {
        const role = formatSenderRole(item.role);
        const name = String(item.name || "Unknown").trim();
        return role ? `${name} · ${role}` : name;
      })
      .join("\n");
  }

  function showSeenBy(message) {
    const seenUsers = message.seenByUsers || [];
    const deliveredUsers = message.deliveredToUsers || [];
    const seenByCount = Number(message.seenByCount || seenUsers.length || 0);

    const sections = [];

    sections.push(`Seen by (${seenByCount})`);

    if (seenUsers.length) {
      sections.push(formatSeenUserList(seenUsers));
    } else if (seenByCount > 0) {
      sections.push("Seen by team members. Names are still syncing for this message.");
    } else {
      sections.push("No one has seen this yet.");
    }

    if (deliveredUsers.length) {
      sections.push("");
      sections.push(`Delivered to (${deliveredUsers.length})`);
      sections.push(formatSeenUserList(deliveredUsers));
    }

    Alert.alert("Message Status", sections.join("\n"));
  }

  function showMessageOptions(message) {
    const actions = [];

    if (canPinMessage(message)) {
      actions.push({
        label: isPinnedMessage(message) ? "Unpin Message" : "Pin Message",
        onPress: async () => {
          try {
            await onPinThreadMessage?.(
              thread.id,
              isPinnedMessage(message) ? null : message.id
            );
          } catch (error) {
            Alert.alert("Could not pin message", error.message || "Try again.");
          }
        },
      });
    }

    actions.push({
      label: "React",
      onPress: () => setReactionPickerMessageId(message.id),
    });

    if (message.isMe) {
      actions.push({
        label: "View Seen By",
        onPress: () => showSeenBy(message),
      });
    }

    if (canDeleteMessage(message)) {
      actions.push({
        label: "Delete Message",
        destructive: true,
        onPress: () => confirmDeleteMessage(message),
      });
    }

    if (Platform.OS === "ios") {
      const options = [...actions.map((action) => action.label), "Cancel"];
      const cancelButtonIndex = options.length - 1;
      const destructiveButtonIndex = actions.findIndex((action) => action.destructive);

      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: message.body ? message.body.slice(0, 80) : "Message",
          options,
          cancelButtonIndex,
          destructiveButtonIndex: destructiveButtonIndex >= 0 ? destructiveButtonIndex : undefined,
          userInterfaceStyle: "light",
        },
        (buttonIndex) => {
          if (buttonIndex === cancelButtonIndex) return;
          actions[buttonIndex]?.onPress?.();
        }
      );

      return;
    }

    Alert.alert(
      "Message",
      message.body ? message.body.slice(0, 120) : "Choose an action",
      [
        ...actions.map((action) => ({
          text: action.label,
          style: action.destructive ? "destructive" : "default",
          onPress: action.onPress,
        })),
        { text: "Cancel", style: "cancel" },
      ]
    );
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
  const didInitialScrollRef = useRef(false);
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

  // Land on latest once when opening/changing a thread.
  useEffect(() => {
    previousMessageCountRef.current = thread?.messages?.length || 0;
    didInitialScrollRef.current = false;
    setIsNearBottom(true);
    setHasNewMessages(false);
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

  function handleSend() {
    const messageToSend = draft.trim();
    if (!messageToSend) return;

    setDraft("");
    setIsNearBottom(true);
    setHasNewMessages(false);
    onSendThreadMessage?.(thread.id, messageToSend);
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
          {shouldShowSenderName(thread.messages, message, index, thread.type) ? (
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
            onLongPress={() => showMessageOptions(message)}
            onPress={() =>
              setReactionPickerMessageId((currentId) =>
                currentId === message.id ? null : message.id
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
            <View
              style={[
                localStyles.messageMetaRow,
                message.isMe ? localStyles.messageMetaRowMe : localStyles.messageMetaRowOther,
              ]}
            >
              {message.isMe && message.status === "sending" ? (
                <Text style={localStyles.messageMetaStatus}>Sending…</Text>
              ) : null}

              {message.isMe && message.status === "failed" ? (
                <TouchableOpacity
                  onPress={() => onRetryThreadMessage?.(thread.id, message)}
                  activeOpacity={0.85}
                >
                  <Text style={[localStyles.messageMetaStatus, localStyles.messageStatusFailed]}>
                    Failed — tap to retry
                  </Text>
                </TouchableOpacity>
              ) : null}

              {message.isMe && getSeenStatusText(message) ? (
                <Text style={localStyles.messageMetaStatus}>{getSeenStatusText(message)}</Text>
              ) : null}

              <Text style={localStyles.messageTime}>{message.time}</Text>
            </View>
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
        keyboardVerticalOffset={Platform.OS === "ios" ? 6 : 0}
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

        {getPinnedMessage() ? (
          <View style={localStyles.pinnedBanner}>
            <View style={localStyles.pinnedIcon}>
              <Text style={localStyles.pinnedIconText}>📌</Text>
            </View>

            <TouchableOpacity
              style={localStyles.pinnedMain}
              activeOpacity={0.85}
              onPress={() =>
                Alert.alert(
                  "Pinned Message",
                  getPinnedMessage()?.body || "Pinned message"
                )
              }
            >
              <Text style={localStyles.pinnedLabel}>PINNED MESSAGE</Text>
              <Text style={localStyles.pinnedText} numberOfLines={2}>
                {getPinnedMessage()?.body || "Pinned message"}
              </Text>
            </TouchableOpacity>

            {canManageThread ? (
              <TouchableOpacity
                style={localStyles.unpinButton}
                onPress={() => onPinThreadMessage?.(thread.id, null)}
                activeOpacity={0.85}
              >
                <Text style={localStyles.unpinButtonText}>Unpin</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

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
            if (!didInitialScrollRef.current) {
              didInitialScrollRef.current = true;
              scrollToLatest(false);
            }
          }}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={24}
          maxToRenderPerBatch={16}
          windowSize={9}
          removeClippedSubviews={Platform.OS !== "ios"}
          ListEmptyComponent={
            <View style={localStyles.emptyChat}>
              <View style={localStyles.emptyIcon}>
                <Text style={localStyles.emptyIconText}>💬</Text>
              </View>
              <Text style={localStyles.emptyTitle}>No messages yet</Text>
              <Text style={localStyles.emptyText}>
                Start the conversation. Store updates, quick questions, and team follow-ups all live here.
              </Text>
            </View>
          }
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
            placeholder="Message"
            placeholderTextColor="#8a8a8e"
            style={localStyles.input}
            multiline
            maxLength={2000}
          />

          <TouchableOpacity
            style={[localStyles.sendButton, !draft.trim() && localStyles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!draft.trim()}
          >
            <Text style={localStyles.sendText}>➤</Text>
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

function shouldShowSenderName(messages, message, index, threadType) {
  if (threadType === "direct") return false;

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
    backgroundColor: "#f3f5f9",
  },
  keyboardWrap: {
    flex: 1,
  },
  header: {
    minHeight: 68,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderBottomWidth: 1,
    borderBottomColor: "#e4e7ee",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 9,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  backButton: {
    width: 34,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  backText: {
    color: "#e91f3f",
    fontSize: 36,
    lineHeight: 38,
    fontWeight: "300",
  },
  manageButton: {
    backgroundColor: "#fff1f4",
    borderWidth: 1,
    borderColor: "#ffd4dd",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  manageButtonText: {
    color: "#e91f3f",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#263244",
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
    minWidth: 0,
  },
  headerName: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.25,
  },
  headerSub: {
    color: "#6b7280",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },
  chatArea: {
    flex: 1,
    backgroundColor: "#f3f5f9",
  },
  chatContent: {
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 18,
    flexGrow: 1,
  },
  emptyChat: {
    flex: 1,
    minHeight: 360,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  emptyIcon: {
    width: 70,
    height: 70,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  emptyIconText: {
    fontSize: 30,
  },
  emptyTitle: {
    color: "#111827",
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    fontWeight: "600",
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
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginVertical: 13,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  dateDividerText: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.45,
  },
  unreadDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 15,
    paddingHorizontal: 10,
  },
  unreadDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#e91f3f",
    opacity: 0.42,
  },
  unreadDividerText: {
    color: "#e91f3f",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  bubbleRow: {
    marginBottom: 6,
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
    marginRight: 8,
  },
  senderName: {
    color: "#64748b",
    fontSize: 11,
    marginLeft: 9,
    marginBottom: 3,
    fontWeight: "800",
  },
  bubble: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 19,
    shadowColor: "#0f172a",
    shadowOpacity: 0.045,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  bubbleMe: {
    backgroundColor: "#e91f3f",
    borderBottomRightRadius: 7,
  },
  bubbleOther: {
    backgroundColor: "#ffffff",
    borderBottomLeftRadius: 7,
    borderWidth: 1,
    borderColor: "#e9edf4",
  },
  bubbleMeFirst: {
    borderBottomRightRadius: 20,
  },
  bubbleMeMiddle: {
    borderTopRightRadius: 7,
    borderBottomRightRadius: 7,
  },
  bubbleMeLast: {
    borderTopRightRadius: 7,
  },
  bubbleOtherFirst: {
    borderBottomLeftRadius: 20,
  },
  bubbleOtherMiddle: {
    borderTopLeftRadius: 7,
    borderBottomLeftRadius: 7,
  },
  bubbleOtherLast: {
    borderTopLeftRadius: 7,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "500",
  },
  bubbleTextMe: {
    color: "#ffffff",
  },
  bubbleTextOther: {
    color: "#111827",
  },
  deletedMessageText: {
    fontStyle: "italic",
    opacity: 0.72,
  },
  messageImage: {
    width: 230,
    height: 230,
    borderRadius: 16,
    marginBottom: 7,
    backgroundColor: "#e5e7eb",
  },
  messageStatusText: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 3,
    alignSelf: "flex-end",
  },
  messageStatusFailed: {
    color: "#e91f3f",
    textDecorationLine: "underline",
  },
  messageMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    paddingHorizontal: 8,
  },
  messageMetaRowMe: {
    alignSelf: "flex-end",
    justifyContent: "flex-end",
  },
  messageMetaRowOther: {
    alignSelf: "flex-start",
    justifyContent: "flex-start",
  },
  messageMetaStatus: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "800",
  },
  reactionSummaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 7,
  },
  reactionSummaryChip: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
  },
  reactionSummaryChipActive: {
    borderColor: "#e91f3f",
  },
  reactionSummaryText: {
    fontSize: 12,
    fontWeight: "800",
  },
  iMessageReactionPicker: {
    position: "absolute",
    top: -42,
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 6,
    gap: 2,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
    zIndex: 20,
  },
  iMessageReactionPickerMe: {
    right: 0,
  },
  iMessageReactionPickerOther: {
    left: 0,
  },
  iMessageReactionButton: {
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  iMessageReactionText: {
    fontSize: 18,
  },
  messageTime: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
    paddingHorizontal: 8,
  },
  pendingImagePanel: {
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  pendingImagePreview: {
    width: "100%",
    height: 230,
    borderRadius: 18,
    backgroundColor: "#e5e7eb",
    marginBottom: 10,
  },
  pendingCaptionInput: {
    minHeight: 42,
    maxHeight: 96,
    backgroundColor: "#f3f5f9",
    borderRadius: 17,
    paddingHorizontal: 13,
    paddingVertical: 10,
    color: "#111827",
    fontSize: 15,
    fontWeight: "600",
  },
  pendingImageActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 11,
  },
  pendingCancelButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#f1f5f9",
  },
  pendingCancelText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "900",
  },
  pendingSendButton: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#e91f3f",
  },
  pendingSendText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  newMessagesButton: {
    position: "absolute",
    alignSelf: "center",
    bottom: 82,
    backgroundColor: "#111827",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    shadowColor: "#0f172a",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  newMessagesButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 12 : 10,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderTopWidth: 1,
    borderTopColor: "#e4e7ee",
  },
  photoButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  photoButtonText: {
    color: "#475569",
    fontSize: 25,
    lineHeight: 28,
    fontWeight: "400",
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 104,
    borderRadius: 20,
    backgroundColor: "#f3f5f9",
    borderWidth: 1,
    borderColor: "#e1e7ef",
    paddingHorizontal: 14,
    paddingTop: Platform.OS === "ios" ? 9 : 7,
    paddingBottom: Platform.OS === "ios" ? 9 : 7,
    color: "#111827",
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "500",
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e91f3f",
    shadowColor: "#e91f3f",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  sendButtonDisabled: {
    backgroundColor: "#cbd5e1",
    shadowOpacity: 0,
  },
  sendText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    marginLeft: 1,
  },
});
