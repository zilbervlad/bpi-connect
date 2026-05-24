import { useEffect, useState } from "react";
import { SafeAreaView, View } from "react-native";
import { StatusBar } from "expo-status-bar";

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
} from "./src/api/client";

import { BottomTabs } from "./src/components/BottomTabs";

import { HomeScreen } from "./src/screens/HomeScreen";
import { InboxScreen } from "./src/screens/InboxScreen";
import { ChatsScreen } from "./src/screens/ChatsScreen";
import { AnnouncementsScreen } from "./src/screens/AnnouncementsScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { MessageScreen } from "./src/screens/MessageScreen";
import { BroadcastScreen } from "./src/screens/BroadcastScreen";
import { ComposeScreen } from "./src/screens/ComposeScreen";
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
    supervisor: "Supervisor",
    general_manager: "General Manager",
    manager: "Manager",
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
    members,
    memberNames: members.map((member) => member.name),
    messages: [],
  };
}

function mapApiThreadMessageToBubble(apiMessage) {
  return {
    id: apiMessage.id,
    apiMessage: true,
    sender: apiMessage.sender?.name || "BPI Connect",
    senderUser: apiMessage.sender || null,
    senderRole: normalizeApiRole(apiMessage.sender?.role || ""),
    body: apiMessage.body,
    text: apiMessage.body,
    time: formatApiTime(apiMessage.created_at),
    isMe: Boolean(apiMessage.is_me),
    requiresAck: apiMessage.requires_ack,
    responded: apiMessage.responded,
    acknowledged: apiMessage.acknowledged,
    reactions: apiMessage.reactions || [],
    attachments: apiMessage.attachments || [],
  };
}

const SAVED_USER_KEY = "bpi_connect_saved_user";

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

  const selectedMessage = messages.find((message) => message.id === selectedMessageId);
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId);

  const unreadCount = threads.reduce((total, thread) => total + thread.unread, 0);
  const ackCount = messages.filter(
    (message) => message.requiresAck && !message.responded
  ).length;

  useEffect(() => {
    async function loadSavedUser() {
      try {
        const savedUserJson = await AsyncStorage.getItem(SAVED_USER_KEY);

        if (savedUserJson) {
          const savedUser = JSON.parse(savedUserJson);
          setCurrentUser(savedUser);
          setIsLoggedIn(true);
          registerPushTokenForUser(savedUser);
        }
      } catch (error) {
        console.log("Could not load saved user:", error.message);
      }
    }

    loadSavedUser();
  }, []);

  useEffect(() => {
    loadApiData();
  }, []);

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

  useEffect(() => {
    if (!selectedThreadId || !usingApi || !currentUser?.id) return undefined;

    refreshOpenThreadMessages(selectedThreadId);

    const interval = setInterval(() => {
      refreshOpenThreadMessages(selectedThreadId);
    }, 1000);

    return () => clearInterval(interval);
  }, [selectedThreadId, usingApi, currentUser?.id]);

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

      setThreads((currentThreads) =>
        currentThreads.map((thread) => {
          if (thread.id !== selectedThreadId) return thread;

          return {
            ...thread,
            messages: thread.messages.map((message) =>
              message.id === messageId
                ? { ...message, reactions: result.reactions || [] }
                : message
            ),
          };
        })
      );
    } catch (error) {
      console.log("Could not update reaction:", error.message);
    }
  }

  function handleLogout() {
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
        item.id === thread.id ? { ...item, unread: 0 } : item
      )
    );

    setSelectedThreadId(thread.id);

    // clear unread when opening thread
    setThreads((currentThreads) =>
      currentThreads.map((item) =>
        item.id === thread.id ? { ...item, unread: 0 } : item
      )
    );

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
                  messages: data.messages.map(mapApiThreadMessageToBubble),
                }
              : item
          )
        );

        await markApiThreadRead(thread.id, currentUser.id);
      } catch (error) {
        console.log("Could not load thread messages:", error.message);
      }
    }
  }

  function closeThread() {
    setSelectedThreadId(null);
  }

  async function sendThreadImageMessage(threadId, imageData, body = "", metadata = {}) {
    if (usingApi && currentUser?.apiUser) {
      try {
        const apiMessage = await sendApiThreadImageMessage(
          threadId,
          currentUser.id,
          imageData,
          body,
          metadata
        );

        const bubbleMessage = mapApiThreadMessageToBubble(apiMessage);

        setThreads((currentThreads) =>
          currentThreads.map((thread) => {
            if (thread.id !== threadId) return thread;

            return {
              ...thread,
              messages: [...thread.messages, bubbleMessage],
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
    if (usingApi && currentUser?.apiUser) {
      try {
        const apiMessage = await sendApiThreadMessage(threadId, currentUser.id, body, requiresAck);
        const bubbleMessage = mapApiThreadMessageToBubble(apiMessage);

        setThreads((currentThreads) =>
          currentThreads.map((thread) => {
            if (thread.id !== threadId) return thread;

            return {
              ...thread,
              messages: [...thread.messages, bubbleMessage],
              lastMessage: body,
              lastTime: "Now",
            };
          })
        );

        return;
      } catch (error) {
        console.log("Could not send API thread message:", error.message);
      }
    }

    setThreads((currentThreads) =>
      currentThreads.map((thread) => {
        if (thread.id !== threadId) return thread;

        const newMessage = {
          id: `m-${Date.now()}`,
          sender: currentUser.name,
          senderRole: currentUser.role,
          body,
          time: "Now",
          isMe: true,
        };

        return {
          ...thread,
          messages: [...thread.messages, newMessage],
          lastMessage: body,
          lastTime: "Now",
        };
      })
    );
  }

  async function acknowledgeMessage(messageId) {
    setMessages((currentMessages) =>
      currentMessages.map((item) =>
        item.id === messageId
          ? { ...item, responded: true, unread: false }
          : item
      )
    );

    if (usingApi && currentUser?.apiUser) {
      try {
        await acknowledgeApiMessage(messageId, currentUser.id);
      } catch (error) {
        console.log("Could not acknowledge:", error.message);
      }
    }
  }

  function changeTab(tab) {
    setSelectedMessageId(null);
    setSelectedThreadId(null);

    if (tab !== "Compose") {
      setStartingRecipient(null);
    }

    setActiveTab(tab);
  }

  function switchUser(user) {
    setCurrentUser(user);
    setSelectedMessageId(null);
    setSelectedThreadId(null);
    setStartingRecipient(null);
    setActiveTab("Home");
    reloadDataForUser(user);
  }

  async function startMessageToRecipient(recipient) {
    setStartingRecipient(recipient);
    setSelectedMessageId(null);
    setSelectedThreadId(null);

    if (usingApi && currentUser?.apiUser && recipient?.id) {
      try {
        const apiThread = await findOrCreateDirectThread(currentUser.id, recipient.id);
        const mappedThread = mapApiThreadToAppThread(apiThread);

        const threadMessages = await fetchApiThreadMessages(apiThread.id, currentUser.id);
        mappedThread.messages = threadMessages.messages.map(mapApiThreadMessageToBubble);

        setThreads((currentThreads) => {
          const exists = currentThreads.some((thread) => thread.id === mappedThread.id);

          if (exists) {
            return currentThreads.map((thread) =>
              thread.id === mappedThread.id ? mappedThread : thread
            );
          }

          return [mappedThread, ...currentThreads];
        });

        setSelectedThreadId(mappedThread.id);
        setActiveTab("Chats");
        return;
      } catch (error) {
        console.log("Could not open direct API thread:", error.message);
      }
    }

    setActiveTab("Compose");
  }

  async function sendUpdate({ title, body, targetGroup, requiresAck }) {
    const targetThread = threads.find(
      (thread) =>
        thread.id === targetGroup.threadId ||
        thread.groupKey === targetGroup.threadGroupKey
    );

    const formattedBody = `${title}\n\n${body}`;

    if (targetThread) {
      await sendThreadMessage(targetThread.id, formattedBody, requiresAck);
      setSelectedThreadId(targetThread.id);
      setActiveTab("Chats");
      return;
    }

    const newMessage = {
      id: Date.now(),
      type: "announcement",
      priority: requiresAck ? "RESPONSE" : "UPDATE",
      title,
      from: `${currentUser.role} · ${currentUser.name}`,
      time: "Just now",
      body: `${body}\n\nTarget: ${targetGroup.label}`,
      requiresAck,
      responded: false,
      unread: true,
    };

    setMessages((currentMessages) => [newMessage, ...currentMessages]);
    setActiveTab("Inbox");
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
            onOpenInbox={() => changeTab("Inbox")}
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
          />
        )}

        {activeTab === "Inbox" && (
          <InboxScreen
            messages={messages}
            unreadCount={unreadCount}
            ackCount={ackCount}
            onOpenMessage={openMessage}
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

        {activeTab === "Compose" && (
          <ComposeScreen
            user={currentUser}
            users={profileUsers}
            usingApi={usingApi}
            startingRecipient={startingRecipient}
            onSendPrivateMessage={sendPrivateMessage}
          />
        )}

        {activeTab === "Announcements" && (
          <AnnouncementsScreen
            messages={messages.filter((message) => message.type === "announcement")}
            onOpenMessage={openMessage}
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
