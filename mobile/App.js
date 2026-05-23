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
  markApiThreadRead,
  findOrCreateDirectThread,
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
    role: normalizeApiRole(apiUser.role),
    store: apiUser.store_name || apiUser.store || "Boston Pie",
    area: apiUser.area || "Company",
    storeGroupId: apiUser.store ? `store-${apiUser.store}` : "company",
    apiUser: true,
  };
}

function mapApiMessageToAppMessage(apiMessage) {
  const acknowledged = Boolean(apiMessage.acknowledged_at);
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
    acknowledged,
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
  return {
    id: apiThread.id,
    apiThread: true,
    type: apiThread.thread_type,
    groupKey: apiThread.group_key,
    name: apiThread.name,
    subtitle: getThreadSubtitle(apiThread.thread_type),
    lastMessage: apiThread.last_message || "",
    lastTime: formatApiTime(apiThread.last_time),
    unread: apiThread.unread || 0,
    members: (apiThread.members || []).map((member) => member.name),
    messages: [],
  };
}

function mapApiThreadMessageToBubble(apiMessage) {
  return {
    id: apiMessage.id,
    apiMessage: true,
    sender: apiMessage.sender?.name || "BPI Connect",
    senderRole: normalizeApiRole(apiMessage.sender?.role || ""),
    body: apiMessage.body,
    time: formatApiTime(apiMessage.created_at),
    isMe: Boolean(apiMessage.is_me),
    requiresAck: apiMessage.requires_ack,
    acknowledged: apiMessage.acknowledged,
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState("Home");
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
    (message) => message.requiresAck && !message.acknowledged
  ).length;

  useEffect(() => {
    loadApiData();
  }, []);

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

  async function openThread(thread) {
    setThreads((currentThreads) =>
      currentThreads.map((item) =>
        item.id === thread.id ? { ...item, unread: 0 } : item
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
                  members: (data.thread.members || []).map((member) => member.name),
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

  async function sendThreadMessage(threadId, body) {
    if (usingApi && currentUser?.apiUser) {
      try {
        const apiMessage = await sendApiThreadMessage(threadId, currentUser.id, body);
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
          ? { ...item, acknowledged: true, unread: false }
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

  async function sendBroadcast({ title, body, targetGroup, requiresAck }) {
    const targetThread = threads.find(
      (thread) => thread.groupKey === targetGroup.threadGroupKey
    );

    const formattedBody = `${title}\n\n${body}`;

    if (targetThread) {
      await sendThreadMessage(targetThread.id, formattedBody);
      setSelectedThreadId(targetThread.id);
      setActiveTab("Chats");
      return;
    }

    const newMessage = {
      id: Date.now(),
      type: "announcement",
      priority: requiresAck ? "ACK" : "STORE",
      title,
      from: `${currentUser.role} · ${currentUser.name}`,
      time: "Just now",
      body: `${body}\n\nTarget: ${targetGroup.label}`,
      requiresAck,
      acknowledged: false,
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

  if (selectedThread) {
    return (
      <ThreadScreen
        thread={selectedThread}
        onBack={closeThread}
        onSendThreadMessage={sendThreadMessage}
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
            onOpenMessage={openMessage}
            onGoInbox={() => changeTab("Chats")}
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

        {activeTab === "Broadcast" && (
          <BroadcastScreen
            user={currentUser}
            onSendBroadcast={sendBroadcast}
          />
        )}

        {activeTab === "Profile" && (
          <ProfileScreen
            user={currentUser}
            users={profileUsers}
            unreadCount={unreadCount}
            ackCount={ackCount}
            onSwitchUser={switchUser}
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
