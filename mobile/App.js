import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, SafeAreaView, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { io } from "socket.io-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { styles } from "./src/styles/styles";
import { demoUsers } from "./src/data/users";

import {
  fetchApiUsers,
  fetchApiMessages,
  createApiMessage,
  markApiMessageRead,
  acknowledgeApiMessage,
  fetchApiThreads,
  fetchApiThreadMessages,
  sendApiThreadMessage,
  sendApiThreadImageMessage,
  markApiThreadRead,
  findOrCreateDirectThread,
  loginApiUser,
  toggleApiThreadMessageReaction,
  acknowledgeApiThreadMessage,
  saveApiUserPushToken,
  setApiThreadMuted,
  setApiThreadFavorite,
  deleteApiThreadForUser,
  deleteApiThreadMessage,
  deleteApiAccount,
} from "./src/api/client";

import { BottomTabs } from "./src/components/BottomTabs";

import { HomeScreen } from "./src/screens/HomeScreen";
import { ChatsScreen } from "./src/screens/ChatsScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { MessageScreen } from "./src/screens/MessageScreen";
import { InboxScreen } from "./src/screens/InboxScreen";
import { BroadcastScreen } from "./src/screens/BroadcastScreen";
import { PeopleScreen } from "./src/screens/PeopleScreen";
import { ThreadScreen } from "./src/screens/ThreadScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { AdminScreen } from "./src/screens/AdminScreen";
import { MoreScreen } from "./src/screens/MoreScreen";
import {
  registerForPushNotificationsAsync,
  addNotificationResponseListener,
  getLastNotificationThreadIdAsync,
} from "./src/services/pushNotifications";

function normalizeApiRole(role) {
  const roleMap = {
    admin: "Admin",
    hr: "HR",
    coach: "Coach",
    supervisor: "Supervisor",
    general_manager: "General Manager",
    manager: "MIT",
    tm: "TM",
  };

  return roleMap[role] || role;
}

function mapApiUserToDemoUser(apiUser) {
  return {
    id: apiUser.id,
    name: apiUser.name,
    email: apiUser.email,
    phone_number: apiUser.phone_number || null,
    phoneNumber: apiUser.phone_number || null,
    avatar_url: apiUser.avatar_url || null,
    avatarUrl: apiUser.avatar_url || null,
    role: normalizeApiRole(apiUser.role),
    store: apiUser.store_name || apiUser.store || "Boston Pie",
    store_name: apiUser.store_name || null,
    store_numbers: apiUser.store_numbers || [],
    store_labels: apiUser.store_labels || [],
    stores_display: apiUser.stores_display || "",
    area: apiUser.area || "Company",
    storeGroupId: apiUser.store ? `store-${apiUser.store}` : "company",
    apiUser: true,
  };
}

function mapApiMessageToAppMessage(apiMessage) {
  const responded = Boolean(apiMessage.responded_at);
  const unread = !apiMessage.read_at;

  return {
    id: apiMessage.id,
    apiMessage: true,
    type: apiMessage.message_type === "announcement" ? "announcement" : "message",
    priority: apiMessage.requires_ack ? "ACK" : "STORE",
    title: apiMessage.title,
    from: apiMessage.sender?.name || "BPI Connect",
    sender: apiMessage.sender || null,
    time: formatApiTime(apiMessage.created_at) || "Now",
    created_at: apiMessage.created_at,
    body: apiMessage.body,
    targetType: apiMessage.target_type,
    targetLabel: apiMessage.target_label,
    requiresAck: apiMessage.requires_ack,
    acknowledged: Boolean(apiMessage.acknowledged_at),
    read_at: apiMessage.read_at || null,
    acknowledged_at: apiMessage.acknowledged_at || null,
    responded,
    unread,
  };
}

function getThreadSubtitle(threadType) {
  const map = {
    direct: "Private message",
    store: "Store group",
    area: "Area group",
    role: "Role group",
    company: "Everyone",
    hr: "HR announcements",
  };

  return map[threadType] || "Group thread";
}

function formatApiTime(value) {
  if (!value) return "";

  try {
    const date = new Date(value);
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function mapApiThreadToAppThread(apiThread) {
  const members = apiThread.members || [];

  return {
    id: apiThread.id,
    apiThread: true,
    type: apiThread.thread_type,
    groupKey: apiThread.group_key,
    name: apiThread.name,
    subtitle: `${getThreadSubtitle(apiThread.thread_type)} · ${members.length} ${members.length === 1 ? "member" : "members"}`,
    lastMessage: apiThread.last_message || "No messages yet",
    lastTime: formatApiTime(apiThread.last_time),
    unread: apiThread.unread || 0,
    muted: Boolean(apiThread.muted),
    favorite: Boolean(apiThread.favorite),
    members,
    memberNames: members.map((member) => member.name),
    messages: [],
  };
}

function mergeThreadMessages(existingMessages = [], freshMessages = []) {
  const existingById = new Map(
    existingMessages
      .filter((message) => message?.id)
      .map((message) => [String(message.id), message])
  );

  const mergedFreshMessages = freshMessages.map((freshMessage) => {
    const existingMessage = existingById.get(String(freshMessage.id));

    if (!existingMessage) {
      return freshMessage;
    }

    return {
      ...existingMessage,
      ...freshMessage,
      status:
        existingMessage.status === "sending" || existingMessage.status === "failed"
          ? existingMessage.status
          : freshMessage.status || existingMessage.status || "sent",
    };
  });

  const pendingMessages = existingMessages.filter((message) => {
    if (!message?.status || !["sending", "failed"].includes(message.status)) {
      return false;
    }

    return !freshMessages.some((freshMessage) => String(freshMessage.id) === String(message.id));
  });

  return [...mergedFreshMessages, ...pendingMessages];
}

function mapApiThreadMessageToBubble(apiMessageResponse) {
  const apiMessage =
    apiMessageResponse?.message ||
    apiMessageResponse?.thread_message ||
    apiMessageResponse;

  return {
    id: apiMessage.id,
    apiMessage: true,
    sender: apiMessage.sender?.name || "BPI Connect",
    senderUser: apiMessage.sender || null,
    senderRole: normalizeApiRole(apiMessage.sender?.role || ""),
    body: apiMessage.body || "",
    text: apiMessage.body || "",
    deleted: apiMessage.body === "This message was deleted" || Boolean(apiMessage.deleted_at),
    deleted_at: apiMessage.deleted_at || null,
    time: formatApiTime(apiMessage.created_at),
    created_at: apiMessage.created_at,
    createdAt: apiMessage.created_at,
    isMe: Boolean(apiMessage.is_me),
    requiresAck: Boolean(apiMessage.requires_ack),
    responded: Boolean(apiMessage.responded),
    acknowledged: Boolean(apiMessage.acknowledged),
    seenByCount: Number(apiMessage.seen_by_count || apiMessage.seen_count || 0),
    deliveredToCount: Number(apiMessage.delivered_to_count || 0),
    reactions: apiMessage.reactions || [],
    attachments: apiMessage.attachments || [],
    status: "sent",
  };
}

const SAVED_USER_KEY = "bpi_connect_saved_user";
const REALTIME_URL = "https://bpi-connect.onrender.com";

export default function App() {
  const [activeTab, setActiveTab] = useState("Home");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isBooting, setIsBooting] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const sendUpdate = async ({ title, body, targetGroup, requiresAck }) => {
    if (!currentUser?.id || !targetGroup || !body?.trim()) {
      console.log("Cannot send update: missing current user, target, or body.");
      return;
    }

    const selectedThread = threads.find(
      (thread) => String(thread.id) === String(targetGroup)
    );

    if (!selectedThread) {
      console.log("Cannot send update: target not found.");
      return;
    }

    const messageTitle = title?.trim() || selectedThread.name || "Company Announcement";
    const messageBody = body.trim();

    // Company announcements are official bulletin posts, not chat messages.
    if (selectedThread.type === "company") {
      if (!usingApi || !currentUser?.apiUser) {
        return;
      }

      const recipientUserIds = (apiUsers || [])
        .map((user) => user.id)
        .filter(Boolean);

      if (!recipientUserIds.length) {
        console.log("Cannot send announcement: no recipients loaded.");
        return;
      }

      try {
        const apiMessage = await createApiMessage({
          senderUserId: currentUser.id,
          title: messageTitle,
          body: messageBody,
          recipientUserIds,
          messageType: "announcement",
          priority: requiresAck ? "ack" : "normal",
          targetType: "company",
          targetLabel: "Company-wide",
          requiresAck: !!requiresAck,
        });

        const mappedMessage = mapApiMessageToAppMessage(apiMessage);
        setMessages((currentMessages) => [mappedMessage, ...currentMessages]);
        setActiveTab("Home");
      } catch (error) {
        console.log("Failed to send company announcement:", error.message);
      }

      return;
    }

    // Store / area / role updates remain chat posts for now.
    const threadMessageBody = messageTitle
      ? `${messageTitle}\n\n${messageBody}`
      : messageBody;

    try {
      await sendApiThreadMessage({
        threadId: targetGroup,
        userId: currentUser.id,
        body: threadMessageBody,
        requiresAck: !!requiresAck,
      });

      if (typeof refreshThreadList === "function") {
        await refreshThreadList();
      }

      await openThread(targetGroup);
    } catch (error) {
      console.log("Failed object-style send update, trying positional send:", error);

      try {
        await sendApiThreadMessage(targetGroup, currentUser.id, threadMessageBody, {
          requiresAck: !!requiresAck,
        });

        if (typeof refreshThreadList === "function") {
          await refreshThreadList();
        }

        await openThread(targetGroup);
      } catch (secondError) {
        console.log("Failed to send update:", secondError);
      }
    }
  };

  const startMessageToRecipient = async (recipient) => {
    if (!recipient?.id || !currentUser?.id) {
      console.log("Cannot start message: missing current user or recipient.");
      return;
    }

    try {
      const result = await findOrCreateDirectThread(currentUser.id, recipient.id);

      const directThread =
        result?.thread ||
        result?.data?.thread ||
        result;

      const threadId =
        directThread?.id ||
        result?.id ||
        result?.thread_id ||
        result?.data?.id ||
        result?.data?.thread_id;

      if (!threadId) {
        console.log("Direct thread returned no thread id:", result);
        return;
      }

      const mappedThread =
        directThread?.thread_type || directThread?.group_key
          ? mapApiThreadToAppThread(directThread)
          : null;

      if (mappedThread) {
        setThreads((currentThreads) => {
          const exists = currentThreads.some(
            (thread) => String(thread.id) === String(mappedThread.id)
          );

          if (exists) {
            return currentThreads.map((thread) =>
              String(thread.id) === String(mappedThread.id)
                ? {
                    ...thread,
                    ...mappedThread,
                    messages: thread.messages || mappedThread.messages || [],
                  }
                : thread
            );
          }

          return [mappedThread, ...currentThreads];
        });

        setSelectedThreadId(mappedThread.id);
        setActiveTab("Chats");
        return;
      }

      if (typeof refreshThreadList === "function") {
        await refreshThreadList();
      }

      setSelectedThreadId(threadId);
      setActiveTab("Chats");
    } catch (error) {
      console.log("Failed to start direct message:", error);
    }
  };
  const [currentUser, setCurrentUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [threads, setThreads] = useState([]);
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [startingRecipient, setStartingRecipient] = useState(null);
  const [apiUsers, setApiUsers] = useState([]);
  const [usingApi, setUsingApi] = useState(false);
  const [typingByThread, setTypingByThread] = useState({});

  const socketRef = useRef(null);
  const selectedThreadIdRef = useRef(selectedThreadId);
  const locallyReadThreadIdsRef = useRef(new Set());
  const openThreadRefreshInFlightRef = useRef(new Set());
  const lastThreadReadAtRef = useRef({});

  const selectedMessage = messages.find((message) => message.id === selectedMessageId);
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId);

  const unreadCount = threads.reduce((total, thread) => total + (thread.unread || 0), 0);
  const ackCount = messages.filter(
    (message) => message.requiresAck && !message.responded
  ).length;

  useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId;
  }, [selectedThreadId]);

  useEffect(() => {
    if (!isLoggedIn || !currentUser?.id || !currentUser?.apiUser) {
      return undefined;
    }

    let isMounted = true;

    async function openThreadFromPush(threadId) {
      if (!threadId || !isMounted) return;

      setActiveTab("Chats");
      setSelectedThreadId(Number(threadId));
      locallyReadThreadIdsRef.current.delete(String(threadId));

      try {
        await refreshThreadList();
        await refreshOpenThreadMessages(Number(threadId));
      } catch (error) {
        console.log("Could not open push thread:", error.message);
      }
    }

    const subscription = addNotificationResponseListener(({ threadId }) => {
      openThreadFromPush(threadId);
    });

    getLastNotificationThreadIdAsync()
      .then((threadId) => {
        if (threadId) {
          openThreadFromPush(threadId);
        }
      })
      .catch((error) => {
        console.log("Could not read last notification:", error.message);
      });

    return () => {
      isMounted = false;
      subscription?.remove?.();
    };
  }, [isLoggedIn, currentUser?.id, currentUser?.apiUser]);

  useEffect(() => {
    async function loadSavedUser() {
      try {
        const savedUserJson = await AsyncStorage.getItem(SAVED_USER_KEY);

        if (savedUserJson) {
          const savedUser = JSON.parse(savedUserJson);

          if (!savedUser?.id) {
            await AsyncStorage.removeItem(SAVED_USER_KEY);
            return;
          }

          const restoredUser = {
            ...savedUser,
            apiUser: true,
          };

          setCurrentUser(restoredUser);
          setIsLoggedIn(true);
          setActiveTab("Home");
          await reloadDataForUser(restoredUser);
          await registerPushTokenForUser(restoredUser);
        }
      } catch (error) {
        console.log("Could not load saved user:", error.message);
      } finally {
        setIsBooting(false);
      }
    }

    loadSavedUser();
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      loadApiData();
    }
  }, [isLoggedIn]);

  async function handleDeleteAccount(confirmText) {
    if (!currentUser?.id) {
      return { success: false, error: "No signed-in user." };
    }

    const result = await deleteApiAccount(currentUser.id, currentUser.id, confirmText);

    await AsyncStorage.removeItem(SAVED_USER_KEY);

    setIsLoggedIn(false);
    setCurrentUser(null);
    setMessages([]);
    setThreads([]);
    setApiUsers([]);
    setSelectedMessageId(null);
    setSelectedThreadId(null);
    setStartingRecipient(null);
    setUsingApi(false);
    setActiveTab("Home");

    return result;
  }

  async function registerPushTokenForUser(user) {
    if (!user?.id || !user?.apiUser) return;

    try {
      const result = await registerForPushNotificationsAsync();

      if (!result.token) {
        console.log("Push token not registered:", result.error);
        return;
      }

      await saveApiUserPushToken(user.id, result.token, {
        platform: result.platform,
        deviceName: result.deviceName,
      });

      console.log("Push token registered.");
    } catch (error) {
      console.log("Could not register push token:", error.message);
    }
  }

  // Realtime Socket.IO connection
  useEffect(() => {
    if (!isLoggedIn || !usingApi || !currentUser?.id || !currentUser?.apiUser) {
      return undefined;
    }

    const socket = io(REALTIME_URL, {
      transports: ["polling", "websocket"],
      upgrade: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
      timeout: 15000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join_user", { user_id: currentUser.id });
    });

    socket.on("thread_message_created", async (payload) => {
      handleRealtimeThreadMessage(payload);
    });

    socket.on("thread_typing_started", (payload) => {
      handleRealtimeTypingStarted(payload);
    });

    socket.on("thread_typing_stopped", (payload) => {
      handleRealtimeTypingStopped(payload);
    });

    socket.on("thread_read_updated", (payload) => {
      handleRealtimeThreadReadUpdated(payload);
    });

    socket.on("thread_typing", (payload) => {
      handleRealtimeThreadTyping(payload);
    });

    socket.on("connect_error", (error) => {
      console.log("Realtime connect error:", error.message);
    });

    return () => {
      socket.off("thread_message_created");
      socket.off("thread_typing");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isLoggedIn, usingApi, currentUser?.id]);

  useEffect(() => {
    if (!selectedThreadId || !usingApi || !currentUser?.id) return undefined;

    refreshOpenThreadMessages(selectedThreadId);

    const interval = setInterval(() => {
      refreshOpenThreadMessages(selectedThreadId);
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedThreadId, usingApi, currentUser?.id]);

  useEffect(() => {
    if (activeTab !== "Chats" || selectedThreadId || !usingApi || !currentUser?.id) {
      return undefined;
    }

    // refreshThreadList interval
    refreshThreadList();

    const interval = setInterval(() => {
      refreshThreadList();
    }, 60000);

    return () => clearInterval(interval);
  }, [activeTab, selectedThreadId, usingApi, currentUser?.id]);

  async function handleLogin(email, password) {
    setIsLoggingIn(true);
    setLoginError("");

    try {
      const apiUser = await loginApiUser(email, password);
      const mappedUser = mapApiUserToDemoUser(apiUser);

      const savedUser = {
        ...mappedUser,
        apiUser: true,
      };

      setCurrentUser(savedUser);
      setIsLoggedIn(true);
      setActiveTab("Home");

      await AsyncStorage.setItem(SAVED_USER_KEY, JSON.stringify(savedUser));

      await reloadDataForUser(savedUser);
      await registerPushTokenForUser(savedUser);
    } catch (error) {
      setLoginError(error.message || "Could not sign in.");
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleAcknowledgeThreadMessage(messageId) {
    if (!selectedThreadId || !currentUser?.id) return;

    try {
      const apiMessage = await acknowledgeApiThreadMessage(messageId, currentUser.id);
      const updatedBubble = mapApiThreadMessageToBubble(apiMessage);

      setThreads((currentThreads) =>
        currentThreads.map((thread) => {
          if (thread.id !== selectedThreadId) return thread;

          return {
            ...thread,
            messages: thread.messages.map((message) =>
              message.id === messageId ? updatedBubble : message
            ),
          };
        })
      );
    } catch (error) {
      console.log("Could not acknowledge thread message:", error.message);
    }
  }

  async function handleReactToThreadMessage(messageId, emoji = "👍") {
    if (!selectedThreadId || !currentUser?.id) return;

    try {
      const result = await toggleApiThreadMessageReaction(messageId, currentUser.id, emoji);

      const updatedReactions =
        result.reactions ||
        result.message?.reactions ||
        result.thread_message?.reactions ||
        [];

      setThreads((currentThreads) =>
        currentThreads.map((thread) => {
          if (thread.id !== selectedThreadId) return thread;

          return {
            ...thread,
            messages: thread.messages.map((message) =>
              message.id === messageId
                ? { ...message, reactions: updatedReactions }
                : message
            ),
          };
        })
      );

      await refreshOpenThreadMessages(selectedThreadId);
    } catch (error) {
      console.log("Could not update reaction:", error.message);
    }
  }

  async function handleUserUpdated(apiUser) {
    if (!apiUser?.id) return;

    const mappedUser = mapApiUserToDemoUser(apiUser);
    const savedUser = {
      ...mappedUser,
      apiUser: true,
    };

    setCurrentUser(savedUser);

    try {
      await AsyncStorage.setItem(SAVED_USER_KEY, JSON.stringify(savedUser));
    } catch (error) {
      console.log("Could not save updated user:", error.message);
    }

    setApiUsers((currentUsers) =>
      currentUsers.map((user) =>
        Number(user.id) === Number(savedUser.id) ? savedUser : user
      )
    );

    setThreads((currentThreads) =>
      currentThreads.map((thread) => ({
        ...thread,
        members: (thread.members || []).map((member) =>
          Number(member.id) === Number(savedUser.id)
            ? {
                ...member,
                avatar_url: savedUser.avatar_url,
                avatarUrl: savedUser.avatarUrl,
              }
            : member
        ),
      }))
    );

    if (typeof reloadDataForUser === "function") {
      await reloadDataForUser(savedUser);
    }
  }


  async function handleLogout() {
    try {
      await AsyncStorage.removeItem(SAVED_USER_KEY);
    } catch (error) {
      console.log("Could not clear saved user:", error.message);
    }

    setIsLoggedIn(false);
    setCurrentUser(null);
    setSelectedMessageId(null);
    setSelectedThreadId(null);
    setStartingRecipient(null);
    setActiveTab("Home");
  }

  async function loadApiData() {
    try {
      const loadedUsers = await fetchApiUsers();
      const mappedUsers = loadedUsers.map(mapApiUserToDemoUser);

      // Do not auto-select a default API user.
      // The logged-in user must only come from handleLogin() or saved AsyncStorage.
      setApiUsers(mappedUsers);
      setUsingApi(true);
    } catch (error) {
      console.log("API unavailable:", error.message);
      setApiUsers([]);
      setMessages([]);
      setThreads([]);
      setUsingApi(false);
    }
  }

  async function reloadDataForUser(user) {
    if (!user?.id) return;

    try {
      const loadedUsers = await fetchApiUsers();
      const loadedMessages = await fetchApiMessages(user.id);
      const loadedThreads = await fetchApiThreads(user.id);

      setApiUsers(loadedUsers.map(mapApiUserToDemoUser));
      setMessages(loadedMessages.map(mapApiMessageToAppMessage));
      setThreads(loadedThreads.map(mapApiThreadToAppThread));
      setUsingApi(true);
    } catch (error) {
      console.log("Could not reload user data:", error.message);
    }
  }

  async function openMessage(message) {
    setMessages((currentMessages) =>
      currentMessages.map((item) =>
        item.id === message.id ? { ...item, unread: false } : item
      )
    );

    setSelectedMessageId(message.id);

    if (usingApi && message.apiMessage && currentUser?.id) {
      try {
        await markApiMessageRead(message.id, currentUser.id);
      } catch (error) {
        console.log("Could not mark read:", error.message);
      }
    }
  }

  async function acknowledgeMessage(messageId) {
    if (!currentUser?.id) return;

    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        Number(message.id) === Number(messageId)
          ? {
              ...message,
              acknowledged: true,
              responded: true,
              unread: false,
              acknowledged_at: new Date().toISOString(),
            }
          : message
      )
    );

    if (!usingApi) return;

    try {
      await acknowledgeApiMessage(messageId, currentUser.id);
    } catch (error) {
      console.log("Could not acknowledge message:", error.message);
      await reloadDataForUser(currentUser);
    }
  }

  function closeMessage() {
    setSelectedMessageId(null);
  }

  function handleRealtimeThreadTyping(payload) {
    if (!payload?.thread_id || !payload?.user_id) return;
    if (Number(payload.user_id) === Number(currentUser?.id)) return;

    const threadId = String(payload.thread_id);

    setTypingByThread((current) => {
      const currentUsers = current[threadId] || {};
      const nextUsers = { ...currentUsers };

      if (payload.is_typing) {
        nextUsers[payload.user_id] = payload.user_name || "Someone";
      } else {
        delete nextUsers[payload.user_id];
      }

      return {
        ...current,
        [threadId]: nextUsers,
      };
    });

    if (payload.is_typing) {
      setTimeout(() => {
        setTypingByThread((current) => {
          const currentUsers = current[threadId] || {};
          if (!currentUsers[payload.user_id]) return current;

          const nextUsers = { ...currentUsers };
          delete nextUsers[payload.user_id];

          return {
            ...current,
            [threadId]: nextUsers,
          };
        });
      }, 2500);
    }
  }

  function sendTypingStatus(threadId, isTyping) {
    if (!socketRef.current?.connected || !currentUser?.id) return;

    socketRef.current.emit("thread_typing", {
      thread_id: threadId,
      user_id: currentUser.id,
      is_typing: isTyping,
    });
  }

  function handleRealtimeTypingStarted(payload) {
    if (!payload?.thread_id || !payload?.user?.id) return;

    if (Number(payload.user.id) === Number(currentUser?.id)) return;

    setTypingByThread((current) => ({
      ...current,
      [payload.thread_id]: {
        userId: payload.user.id,
        name: payload.user.name || "Someone",
        updatedAt: Date.now(),
      },
    }));

    setTimeout(() => {
      setTypingByThread((current) => {
        const currentTyping = current[payload.thread_id];

        if (!currentTyping || currentTyping.userId !== payload.user.id) {
          return current;
        }

        if (Date.now() - currentTyping.updatedAt < 2500) {
          return current;
        }

        const next = { ...current };
        delete next[payload.thread_id];
        return next;
      });
    }, 3000);
  }

  function handleRealtimeTypingStopped(payload) {
    if (!payload?.thread_id || !payload?.user?.id) return;

    setTypingByThread((current) => {
      const currentTyping = current[payload.thread_id];

      if (!currentTyping || currentTyping.userId !== payload.user.id) {
        return current;
      }

      const next = { ...current };
      delete next[payload.thread_id];
      return next;
    });
  }

  function emitThreadTyping(threadId, isTyping) {
    if (!socketRef.current?.connected || !currentUser?.id || !threadId) return;

    socketRef.current.emit(isTyping ? "typing_started" : "typing_stopped", {
      user_id: currentUser.id,
      thread_id: threadId,
    });
  }

  async function handleRealtimeThreadReadUpdated(payload) {
    if (!payload?.thread_id || !currentUser?.id) return;

    if (Number(payload.user_id) === Number(currentUser.id)) return;

    const threadId = payload.thread_id;
    const isOpenThread = Number(selectedThreadIdRef.current) === Number(threadId);

    if (isOpenThread) {
      await refreshOpenThreadMessages(threadId);
    } else {
      await refreshThreadList();
    }
  }

  async function handleRealtimeThreadMessage(payload) {
    if (!payload?.thread_id || !payload?.message) return;

    const incomingThread = payload.thread ? mapApiThreadToAppThread(payload.thread) : null;
    const incomingMessage = mapApiThreadMessageToBubble(payload.message);
    const threadId = payload.thread_id;
    const isOpenThread = Number(selectedThreadIdRef.current) === Number(threadId);

    if (!isOpenThread && !incomingMessage.isMe) {
      locallyReadThreadIdsRef.current.delete(String(threadId));
    }

    setThreads((currentThreads) => {
      const existingThread = currentThreads.find((thread) => Number(thread.id) === Number(threadId));

      if (!existingThread && incomingThread) {
        return [
          {
            ...incomingThread,
            unread: isOpenThread || incomingMessage.isMe ? 0 : incomingThread.unread || 1,
            messages: isOpenThread ? [incomingMessage] : [],
          },
          ...currentThreads,
        ];
      }

      return currentThreads.map((thread) => {
        if (Number(thread.id) !== Number(threadId)) return thread;

        const existingMessages = thread.messages || [];
        const alreadyExists = existingMessages.some(
          (message) => String(message.id) === String(incomingMessage.id)
        );

        const withoutMatchingPending =
          incomingMessage.isMe
            ? existingMessages.filter(
                (message) =>
                  !(
                    message.status === "sending" &&
                    String(message.body || "") === String(incomingMessage.body || "")
                  )
              )
            : existingMessages;

        const nextMessages =
          isOpenThread && alreadyExists
            ? withoutMatchingPending.map((message) =>
                String(message.id) === String(incomingMessage.id)
                  ? { ...message, ...incomingMessage, status: message.status || "sent" }
                  : message
              )
            : isOpenThread
              ? [...withoutMatchingPending, { ...incomingMessage, status: "sent" }]
              : withoutMatchingPending;

        return {
          ...thread,
          ...(incomingThread || {}),
          messages: nextMessages,
          lastMessage: incomingMessage.body || incomingThread?.lastMessage || thread.lastMessage,
          lastTime: incomingMessage.time || incomingThread?.lastTime || "Now",
          unread: isOpenThread || incomingMessage.isMe ? 0 : (thread.unread || 0) + 1,
        };
      });
    });

    if (isOpenThread && !incomingMessage.isMe && usingApi && currentUser?.id) {
      try {
        await markThreadReadAndClear(threadId);
      } catch (error) {
        console.log("Could not mark realtime message read:", error.message);
      }
    }
  }

  async function refreshThreadList() {
    if (!usingApi || !currentUser?.id) return;

    try {
      const loadedThreads = await fetchApiThreads(currentUser.id);
      const mappedThreads = loadedThreads.map(mapApiThreadToAppThread);
      const openThreadId = selectedThreadIdRef.current;

      setThreads((currentThreads) =>
        mappedThreads.map((freshThread) => {
          const existingThread = currentThreads.find(
            (item) => String(item.id) === String(freshThread.id)
          );

          const isOpenThread = String(freshThread.id) === String(openThreadId);
          const wasLocallyRead = locallyReadThreadIdsRef.current.has(String(freshThread.id));

          return {
            ...freshThread,
            messages: existingThread?.messages || freshThread.messages || [],
            unreadAtOpen: existingThread?.unreadAtOpen || 0,
            unread: isOpenThread || wasLocallyRead ? 0 : freshThread.unread || 0,
          };
        })
      );
    } catch (error) {
      console.log("Could not refresh thread list:", error.message);
    }
  }

  async function refreshOpenThreadMessages(threadId = selectedThreadId) {
    if (!threadId || !usingApi || !currentUser?.id) return;

    const refreshKey = `${currentUser.id}:${threadId}`;

    if (openThreadRefreshInFlightRef.current.has(refreshKey)) {
      return;
    }

    openThreadRefreshInFlightRef.current.add(refreshKey);

    try {
      const data = await fetchApiThreadMessages(threadId, currentUser.id);
      await markThreadReadAndClear(threadId);
      const mappedMessages = data.messages.map(mapApiThreadMessageToBubble);
      const members = data.thread.members || [];

      setThreads((currentThreads) =>
        currentThreads.map((thread) => {
          if (Number(thread.id) !== Number(threadId)) return thread;

          return {
            ...thread,
            lastMessage: data.thread.last_message || thread.lastMessage,
            lastTime: formatApiTime(data.thread.last_time) || thread.lastTime,
            unread: 0,
            members,
            memberNames: members.map((member) => member.name),
            subtitle: `${getThreadSubtitle(data.thread.thread_type)} · ${members.length} ${members.length === 1 ? "member" : "members"}`,
            messages: mergeThreadMessages(thread.messages || [], mappedMessages),
          };
        })
      );
    } catch (error) {
      console.log("Could not refresh open thread:", error.message);
    } finally {
      openThreadRefreshInFlightRef.current.delete(refreshKey);
    }
  }

  async function markThreadReadAndClear(threadId) {
    if (!threadId) return;

    locallyReadThreadIdsRef.current.add(String(threadId));

    setThreads((currentThreads) =>
      currentThreads.map((thread) =>
        Number(thread.id) === Number(threadId)
          ? {
              ...thread,
              unread: 0,
              unreadAtOpen: thread.unreadAtOpen || thread.unread || 0,
            }
          : thread
      )
    );

    if (!usingApi || !currentUser?.id) return;

    const readKey = `${currentUser.id}:${threadId}`;
    const now = Date.now();
    const lastReadAt = lastThreadReadAtRef.current[readKey] || 0;

    if (now - lastReadAt < 2500) {
      return;
    }

    lastThreadReadAtRef.current[readKey] = now;

    try {
      await markApiThreadRead(threadId, currentUser.id);

      setThreads((currentThreads) =>
        currentThreads.map((thread) =>
          Number(thread.id) === Number(threadId)
            ? {
                ...thread,
                unread: 0,
              }
            : thread
        )
      );
    } catch (error) {
      console.log("Could not mark thread read:", error.message);
    }
  }

  async function openThread(threadOrId) {
    const thread =
      typeof threadOrId === "object"
        ? threadOrId
        : threads.find((item) => item.id === threadOrId);

    if (!thread) return;

    const unreadAtOpen = thread.unread || 0;

    setThreads((currentThreads) =>
      currentThreads.map((item) =>
        Number(item.id) === Number(thread.id)
          ? {
              ...item,
              unreadAtOpen,
              unread: 0,
            }
          : item
      )
    );

    setSelectedThreadId(thread.id);
    markThreadReadAndClear(thread.id);

    // Message loading is handled by the selectedThreadId effect.
    // Avoid fetching here too, because it causes duplicate refresh/read calls.
  }

  async function handleToggleThreadMute(threadId, muted) {
    if (!currentUser?.id) return;

    // Optimistic UI update so the button changes immediately
    setThreads((currentThreads) =>
      currentThreads.map((thread) =>
        thread.id === threadId ? { ...thread, muted } : thread
      )
    );

    if (!usingApi) return;

    try {
      const updatedThread = await setApiThreadMuted(threadId, currentUser.id, muted);
      const mappedThread = mapApiThreadToAppThread(updatedThread);

      setThreads((currentThreads) =>
        currentThreads.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                muted: Boolean(mappedThread.muted),
              }
            : thread
        )
      );
    } catch (error) {
      console.log("Could not toggle thread mute:", error.message);

      // Roll back if API failed
      setThreads((currentThreads) =>
        currentThreads.map((thread) =>
          thread.id === threadId ? { ...thread, muted: !muted } : thread
        )
      );
    }
  }

  async function handleToggleThreadFavorite(threadId, favorite) {
    if (!currentUser?.id) return;

    setThreads((currentThreads) =>
      currentThreads.map((thread) =>
        thread.id === threadId ? { ...thread, favorite } : thread
      )
    );

    if (!usingApi) return;

    try {
      const updatedThread = await setApiThreadFavorite(threadId, currentUser.id, favorite);
      const mappedThread = mapApiThreadToAppThread(updatedThread);

      setThreads((currentThreads) =>
        currentThreads.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                favorite: Boolean(mappedThread.favorite),
              }
            : thread
        )
      );
    } catch (error) {
      console.log("Could not toggle thread favorite:", error.message);

      setThreads((currentThreads) =>
        currentThreads.map((thread) =>
          thread.id === threadId ? { ...thread, favorite: !favorite } : thread
        )
      );
    }
  }

  async function handleDeleteThread(threadId) {
    if (!currentUser?.id) return;

    const previousThreads = threads;

    setThreads((currentThreads) =>
      currentThreads.filter((thread) => thread.id !== threadId)
    );

    if (!usingApi) return;

    try {
      await deleteApiThreadForUser(threadId, currentUser.id);
    } catch (error) {
      console.log("Could not delete thread:", error.message);
      setThreads(previousThreads);
    }
  }

  function closeThread() {
    setSelectedThreadId(null);
  }

  async function deleteThreadMessage(messageId) {
    if (!selectedThreadId || !currentUser?.id || !messageId) return;

    const deletedBubblePatch = {
      body: "This message was deleted",
      text: "This message was deleted",
      deleted: true,
      requiresAck: false,
      responded: false,
      acknowledged: false,
      reactions: [],
      attachments: [],
      status: "sent",
    };

    setThreads((currentThreads) =>
      currentThreads.map((thread) => {
        if (Number(thread.id) !== Number(selectedThreadId)) return thread;

        return {
          ...thread,
          messages: (thread.messages || []).map((message) =>
            String(message.id) === String(messageId)
              ? { ...message, ...deletedBubblePatch }
              : message
          ),
        };
      })
    );

    if (!usingApi || !currentUser?.apiUser) return;

    try {
      const result = await deleteApiThreadMessage(messageId, currentUser.id);
      const updatedBubble = mapApiThreadMessageToBubble(result.message || result);

      setThreads((currentThreads) =>
        currentThreads.map((thread) => {
          if (Number(thread.id) !== Number(selectedThreadId)) return thread;

          return {
            ...thread,
            messages: (thread.messages || []).map((message) =>
              String(message.id) === String(messageId)
                ? { ...message, ...updatedBubble, deleted: true }
                : message
            ),
          };
        })
      );
    } catch (error) {
      console.log("Could not delete thread message:", error.message);
      await refreshOpenThreadMessages(selectedThreadId);
    }
  }

  async function retryFailedThreadMessage(threadId, failedMessage) {
    if (!failedMessage?.retryBody) return;

    setThreads((currentThreads) =>
      currentThreads.map((thread) => {
        if (thread.id !== threadId) return thread;

        return {
          ...thread,
          messages: (thread.messages || []).filter(
            (message) => String(message.id) !== String(failedMessage.id)
          ),
        };
      })
    );

    await sendThreadMessage(threadId, failedMessage.retryBody, Boolean(failedMessage.requiresAck));
  }

  async function sendThreadImageMessage(threadId, imageData, body = "", metadata = {}) {
    if (usingApi && currentUser?.apiUser) {
      try {
        const apiMessageResponse = await sendApiThreadImageMessage(
          threadId,
          currentUser.id,
          imageData,
          body,
          metadata
        );

        const bubbleMessage = mapApiThreadMessageToBubble(apiMessageResponse);

        if (!bubbleMessage.body && !bubbleMessage.attachments?.length) {
          await refreshOpenThreadMessages(threadId);
          return;
        }

        setThreads((currentThreads) =>
          currentThreads.map((thread) => {
            if (thread.id !== threadId) return thread;

            const existingMessages = thread.messages || [];
            const alreadyExists = existingMessages.some(
              (message) => String(message.id) === String(bubbleMessage.id)
            );

            return {
              ...thread,
              messages: alreadyExists ? existingMessages : [...existingMessages, bubbleMessage],
              lastMessage: body || "Photo",
              lastTime: "Now",
            };
          })
        );

        return;
      } catch (error) {
        console.log("Could not send API image message:", error.message);
        throw error;
      }
    }
  }

  async function sendThreadMessage(threadId, body, requiresAck = false) {
    const cleanBody = String(body || "").trim();
    if (!cleanBody) return;

    emitThreadTyping(threadId, false);

    if (usingApi && currentUser?.apiUser) {
      const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const pendingMessage = {
        id: pendingId,
        sender: currentUser.name,
        senderUser: currentUser,
        senderRole: currentUser.role,
        body: cleanBody,
        text: cleanBody,
        time: "Now",
        isMe: true,
        requiresAck,
        responded: false,
        acknowledged: false,
        reactions: [],
        attachments: [],
        status: "sending",
        retryBody: cleanBody,
      };

      setThreads((currentThreads) =>
        currentThreads.map((thread) => {
          if (thread.id !== threadId) return thread;

          return {
            ...thread,
            messages: [...(thread.messages || []), pendingMessage],
            lastMessage: cleanBody,
            lastTime: "Now",
          };
        })
      );

      try {
        const apiMessageResponse = await sendApiThreadMessage(
          threadId,
          currentUser.id,
          cleanBody,
          requiresAck
        );

        const bubbleMessage = {
          ...mapApiThreadMessageToBubble(apiMessageResponse),
          status: "sent",
        };

        if (!bubbleMessage.body && !bubbleMessage.attachments?.length) {
          await refreshOpenThreadMessages(threadId);
          return;
        }

        setThreads((currentThreads) =>
          currentThreads.map((thread) => {
            if (thread.id !== threadId) return thread;

            const existingMessages = thread.messages || [];
            const withoutPending = existingMessages.filter(
              (message) => String(message.id) !== String(pendingId)
            );

            const alreadyExists = withoutPending.some(
              (message) => String(message.id) === String(bubbleMessage.id)
            );

            return {
              ...thread,
              messages: alreadyExists ? withoutPending : [...withoutPending, bubbleMessage],
              lastMessage: cleanBody,
              lastTime: "Now",
            };
          })
        );

        return;
      } catch (error) {
        console.log("Could not send API thread message:", error.message);

        setThreads((currentThreads) =>
          currentThreads.map((thread) => {
            if (thread.id !== threadId) return thread;

            return {
              ...thread,
              messages: (thread.messages || []).map((message) =>
                String(message.id) === String(pendingId)
                  ? {
                      ...message,
                      status: "failed",
                      failed: true,
                      errorMessage: error.message || "Could not send",
                    }
                  : message
              ),
            };
          })
        );

        return;
      }
    }

    setThreads((currentThreads) =>
      currentThreads.map((thread) => {
        if (thread.id !== threadId) return thread;

        const newMessage = {
          id: `m-${Date.now()}`,
          sender: currentUser.name,
          senderRole: currentUser.role,
          body: cleanBody,
          text: cleanBody,
          time: "Now",
          isMe: true,
          status: "sent",
        };

        return {
          ...thread,
          lastMessage: cleanBody,
          lastTime: "Now",
          messages: [...(thread.messages || []), newMessage],
        };
      })
    );
  }

  function sendPrivateMessage({ recipient, body }) {
    const threadId = `dm-${recipient.id}`;

    const existingThread = threads.find((thread) => thread.id === threadId);

    if (existingThread) {
      sendThreadMessage(threadId, body);
      setSelectedThreadId(threadId);
      setActiveTab("Chats");
      return;
    }

    const newThread = {
      id: threadId,
      type: "direct",
      groupKey: threadId,
      name: recipient.name,
      subtitle: "Private message",
      lastMessage: body,
      lastTime: "Now",
      unread: 0,
      members: [currentUser.name, recipient.name],
      messages: [
        {
          id: `m-${Date.now()}`,
          sender: currentUser.name,
          senderRole: currentUser.role,
          body,
          time: "Now",
          isMe: true,
        },
      ],
    };

    setThreads((currentThreads) => [newThread, ...currentThreads]);
    setStartingRecipient(null);
    setSelectedThreadId(newThread.id);
    setActiveTab("Chats");
  }

  function changeTab(nextTab) {
    setActiveTab(nextTab);
    setSelectedMessageId(null);
    setSelectedThreadId(null);
    setStartingRecipient(null);
  }

  const profileUsers = usingApi && apiUsers.length ? apiUsers : demoUsers;

  if (isBooting) {
    return (
      <SafeAreaView style={styles.appShell}>
        <StatusBar style="light" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <ActivityIndicator size="large" color="#e91f3f" />
          <Text style={{ color: "#ffffff", fontSize: 18, fontWeight: "900", marginTop: 18 }}>
            Loading BPI Connect
          </Text>
          <Text style={{ color: "#9aacbf", fontSize: 13, fontWeight: "700", marginTop: 6, textAlign: "center" }}>
            Getting your current chats and updates...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isLoggedIn) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        errorMessage={loginError}
        isLoading={isLoggingIn}
      />
    );
  }

  if (selectedThread) {
    return (
      <ThreadScreen
        thread={selectedThread}
        onBack={closeThread}
        onSendThreadMessage={sendThreadMessage}
        onSendThreadImageMessage={sendThreadImageMessage}
        onRetryThreadMessage={retryFailedThreadMessage}
            onDeleteThreadMessage={deleteThreadMessage}
        onTypingChange={sendTypingStatus}
        typingUsers={Object.values(typingByThread[String(selectedThread.id)] || {})}
        onRefreshThread={refreshOpenThreadMessages}
        onReact={handleReactToThreadMessage}
        onAcknowledge={handleAcknowledgeThreadMessage}
      />
    );
  }

  if (selectedMessage) {
    return (
      <MessageScreen
        message={selectedMessage}
        onBack={closeMessage}
        onAcknowledge={acknowledgeMessage}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      <View style={styles.appShell}>
        {activeTab === "Home" && (
          <HomeScreen
            user={currentUser}
            unreadCount={unreadCount}
            ackCount={ackCount}
            messages={messages}
            threads={threads}
            onOpenInbox={() => changeTab("Announcements")}
            onOpenChats={() => changeTab("Chats")}
            onOpenThread={(threadId) => openThread(threadId)}
            onOpenMessage={openMessage}
            onOpenPeople={() => changeTab("People")}
            onOpenSend={() => changeTab("Broadcast")}
            onOpenAdmin={() => changeTab("Admin")}
          />
        )}

        {activeTab === "Announcements" && (
          <InboxScreen
            messages={messages.filter((message) => message.type === "announcement")}
            unreadCount={messages.filter((message) => message.type === "announcement" && message.unread).length}
            ackCount={messages.filter((message) => message.type === "announcement" && message.requiresAck && !message.acknowledged).length}
            onOpenMessage={openMessage}
          />
        )}

        {activeTab === "Chats" && (
          <ChatsScreen
            threads={threads}
            onOpenThread={openThread}
            onToggleMute={handleToggleThreadMute}
            onToggleFavorite={handleToggleThreadFavorite}
            onDeleteThread={handleDeleteThread}
          />
        )}

        {activeTab === "People" && (
          <PeopleScreen
            user={currentUser}
            users={profileUsers}
            usingApi={usingApi}
            onStartMessage={startMessageToRecipient}
          />
        )}

        {(activeTab === "Broadcast" || activeTab === "Update") && (
          <BroadcastScreen
            user={currentUser}
            threads={threads}
            onSendUpdate={sendUpdate}
          />
        )}

        {activeTab === "More" && (
          <MoreScreen
            user={currentUser}
            unreadCount={unreadCount}
            ackCount={ackCount}
            onOpenAdmin={() => changeTab("Admin")}
            onOpenProfile={() => changeTab("Profile")}
            onLogout={handleLogout}
          />
        )}

        {activeTab === "Admin" && (
          <AdminScreen user={currentUser} />
        )}

        {activeTab === "Profile" && (
          <ProfileScreen
            user={currentUser}
            unreadCount={unreadCount}
            ackCount={ackCount}
            onLogout={handleLogout}
            onUserUpdated={handleUserUpdated}
            onDeleteAccount={handleDeleteAccount}
          />
        )}
      </View>

      <BottomTabs
        activeTab={activeTab}
        onChangeTab={changeTab}
        unreadCount={unreadCount}
        user={currentUser}
      />
    </SafeAreaView>
  );
}
