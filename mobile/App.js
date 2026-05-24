import { useEffect, useRef, useState } from "react";
import { SafeAreaView, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { io } from "socket.io-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { styles } from "./src/styles/styles";
import { demoUsers } from "./src/data/users";
import { starterMessages } from "./src/data/messages";
import { starterThreads } from "./src/data/threads";

import {
  fetchApiUsers,
  fetchApiMessages,
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
} from "./src/api/client";

import { BottomTabs } from "./src/components/BottomTabs";

import { HomeScreen } from "./src/screens/HomeScreen";
import { ChatsScreen } from "./src/screens/ChatsScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { MessageScreen } from "./src/screens/MessageScreen";
import { BroadcastScreen } from "./src/screens/BroadcastScreen";
import { PeopleScreen } from "./src/screens/PeopleScreen";
import { ThreadScreen } from "./src/screens/ThreadScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { AdminScreen } from "./src/screens/AdminScreen";
import { MoreScreen } from "./src/screens/MoreScreen";
import { registerForPushNotificationsAsync } from "./src/services/pushNotifications";

function normalizeApiRole(role) {
  const roleMap = {
    admin: "Admin",
    hr: "HR",
    coach: "Coach",
    supervisor: "Coach",
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
    avatar_url: apiUser.avatar_url || null,
    avatarUrl: apiUser.avatar_url || null,
    role: normalizeApiRole(apiUser.role),
    store: apiUser.store_name || apiUser.store || "Boston Pie",
    store_name: apiUser.store_name || null,
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
    time: "API",
    body: apiMessage.body,
    requiresAck: apiMessage.requires_ack,
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
    time: formatApiTime(apiMessage.created_at),
    created_at: apiMessage.created_at,
    createdAt: apiMessage.created_at,
    isMe: Boolean(apiMessage.is_me),
    requiresAck: Boolean(apiMessage.requires_ack),
    responded: Boolean(apiMessage.responded),
    acknowledged: Boolean(apiMessage.acknowledged),
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
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(demoUsers[0]);
  const [messages, setMessages] = useState(starterMessages);
  const [threads, setThreads] = useState(starterThreads);
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [startingRecipient, setStartingRecipient] = useState(null);
  const [apiUsers, setApiUsers] = useState([]);
  const [usingApi, setUsingApi] = useState(false);
  const [typingByThread, setTypingByThread] = useState({});

  const socketRef = useRef(null);
  const selectedThreadIdRef = useRef(selectedThreadId);

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
    async function loadSavedUser() {
      try {
        const savedUserJson = await AsyncStorage.getItem(SAVED_USER_KEY);

        if (savedUserJson) {
          const savedUser = JSON.parse(savedUserJson);
          setCurrentUser(savedUser);
          setIsLoggedIn(true);
          await reloadDataForUser(savedUser);
          registerPushTokenForUser(savedUser);
        }
      } catch (error) {
        console.log("Could not load saved user:", error.message);
      }
    }

    loadSavedUser();
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      loadApiData();
    }
  }, [isLoggedIn]);

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

      setCurrentUser(mappedUser);
      setIsLoggedIn(true);
      setActiveTab("Home");

      await reloadDataForUser(mappedUser);
      await registerPushTokenForUser(mappedUser);
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

  async function handleLogout() {
    try {
      await AsyncStorage.removeItem(SAVED_USER_KEY);
    } catch (error) {
      console.log("Could not clear saved user:", error.message);
    }

    setIsLoggedIn(false);
    setSelectedMessageId(null);
    setSelectedThreadId(null);
    setStartingRecipient(null);
    setActiveTab("Home");
  }

  async function loadApiData() {
    try {
      const loadedUsers = await fetchApiUsers();
      const mappedUsers = loadedUsers.map(mapApiUserToDemoUser);

      const defaultUser =
        mappedUsers.find((user) => user.role === "Admin") || mappedUsers[0];

      const loadedMessages = await fetchApiMessages(defaultUser?.id);
      const loadedThreads = await fetchApiThreads(defaultUser?.id);

      setApiUsers(mappedUsers);
      setCurrentUser(defaultUser || demoUsers[0]);
      setMessages(
        loadedMessages.length
          ? loadedMessages.map(mapApiMessageToAppMessage)
          : starterMessages
      );
      setThreads(
        loadedThreads.length
          ? loadedThreads.map(mapApiThreadToAppThread)
          : starterThreads
      );
      setUsingApi(true);
    } catch (error) {
      console.log("API unavailable, using local demo data:", error.message);
      setApiUsers([]);
      setCurrentUser(demoUsers[0]);
      setMessages(starterMessages);
      setThreads(starterThreads);
      setUsingApi(false);
    }
  }

  async function reloadDataForUser(user) {
    if (!usingApi || !user?.apiUser) return;

    try {
      const loadedMessages = await fetchApiMessages(user.id);
      const loadedThreads = await fetchApiThreads(user.id);

      setMessages(loadedMessages.map(mapApiMessageToAppMessage));
      setThreads(loadedThreads.map(mapApiThreadToAppThread));
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

  async function handleRealtimeThreadMessage(payload) {
    if (!payload?.thread_id || !payload?.message) return;

    const incomingThread = payload.thread ? mapApiThreadToAppThread(payload.thread) : null;
    const incomingMessage = mapApiThreadMessageToBubble(payload.message);
    const threadId = payload.thread_id;
    const isOpenThread = Number(selectedThreadIdRef.current) === Number(threadId);

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
          isOpenThread && !alreadyExists
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
        await markApiThreadRead(threadId, currentUser.id);
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

      setThreads((currentThreads) =>
        mappedThreads.map((freshThread) => {
          const existingThread = currentThreads.find((item) => item.id === freshThread.id);

          return {
            ...freshThread,
            messages: existingThread?.messages || freshThread.messages || [],
          };
        })
      );
    } catch (error) {
      console.log("Could not refresh thread list:", error.message);
    }
  }

  async function refreshOpenThreadMessages(threadId = selectedThreadId) {
    if (!threadId || !usingApi || !currentUser?.id) return;

    try {
      const data = await fetchApiThreadMessages(threadId, currentUser.id);
      await markApiThreadRead(threadId, currentUser.id);
      const mappedMessages = data.messages.map(mapApiThreadMessageToBubble);
      const members = data.thread.members || [];

      setThreads((currentThreads) =>
        currentThreads.map((thread) => {
          if (thread.id !== threadId) return thread;

          return {
            ...thread,
            lastMessage: data.thread.last_message || thread.lastMessage,
            lastTime: formatApiTime(data.thread.last_time) || thread.lastTime,
            unread: 0,
            members,
            memberNames: members.map((member) => member.name),
            subtitle: `${getThreadSubtitle(data.thread.thread_type)} · ${members.length} ${members.length === 1 ? "member" : "members"}`,
            messages: mappedMessages,
          };
        })
      );
    } catch (error) {
      console.log("Could not refresh open thread:", error.message);
    }
  }

  async function openThread(threadOrId) {
    const thread =
      typeof threadOrId === "object"
        ? threadOrId
        : threads.find((item) => item.id === threadOrId);

    if (!thread) return;

    setThreads((currentThreads) =>
      currentThreads.map((item) =>
        item.id === thread.id
          ? {
              ...item,
              unreadAtOpen: item.unread || 0,
              unread: 0,
            }
          : item
      )
    );

    setSelectedThreadId(thread.id);

    if (usingApi && thread.apiThread && currentUser?.id) {
      try {
        const data = await fetchApiThreadMessages(thread.id, currentUser.id);

        setThreads((currentThreads) =>
          currentThreads.map((item) =>
            item.id === thread.id
              ? {
                  ...item,
                  members: data.thread.members || [],
                  memberNames: (data.thread.members || []).map((member) => member.name),
                  subtitle: `${getThreadSubtitle(data.thread.thread_type)} · ${(data.thread.members || []).length} ${(data.thread.members || []).length === 1 ? "member" : "members"}`,
                  unreadAtOpen: item.unreadAtOpen || thread.unread || 0,
                  messages: data.messages.map(mapApiThreadMessageToBubble),
                }
              : item
          )
        );

        await markApiThreadRead(thread.id, currentUser.id);

        setThreads((currentThreads) =>
          currentThreads.map((item) =>
            item.id === thread.id ? { ...item, unread: 0 } : item
          )
        );
      } catch (error) {
        console.log("Could not load thread messages:", error.message);
      }
    }
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

  function closeThread() {
    setSelectedThreadId(null);
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

  const profileUsers = usingApi && apiUsers.length ? apiUsers : demoUsers;

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
            onOpenInbox={() => changeTab("Chats")}
            onOpenChats={() => changeTab("Chats")}
            onOpenThread={(threadId) => openThread(threadId)}
            onOpenPeople={() => changeTab("People")}
            onOpenSend={() => changeTab("Broadcast")}
            onOpenAdmin={() => changeTab("Admin")}
          />
        )}

        {activeTab === "Chats" && (
          <ChatsScreen
            threads={threads}
            onOpenThread={openThread}
            onToggleMute={handleToggleThreadMute}
            onToggleFavorite={handleToggleThreadFavorite}
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
