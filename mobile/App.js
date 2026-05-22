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
      const mappedMessages = loadedMessages.map(mapApiMessageToAppMessage);

      setApiUsers(mappedUsers);
      setCurrentUser(defaultUser || demoUsers[0]);
      setMessages(mappedMessages.length ? mappedMessages : starterMessages);
      setUsingApi(true);
    } catch (error) {
      console.log("API unavailable, using local demo data:", error.message);
      setApiUsers([]);
      setCurrentUser(demoUsers[0]);
      setMessages(starterMessages);
      setUsingApi(false);
    }
  }

  async function reloadMessagesForUser(user) {
    if (!usingApi || !user?.apiUser) return;

    try {
      const loadedMessages = await fetchApiMessages(user.id);
      setMessages(loadedMessages.map(mapApiMessageToAppMessage));
    } catch (error) {
      console.log("Could not reload messages:", error.message);
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

  function openThread(thread) {
    setThreads((currentThreads) =>
      currentThreads.map((item) =>
        item.id === thread.id ? { ...item, unread: 0 } : item
      )
    );

    setSelectedThreadId(thread.id);
  }

  function closeThread() {
    setSelectedThreadId(null);
  }

  function sendThreadMessage(threadId, body) {
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
    reloadMessagesForUser(user);
  }

  function startMessageToRecipient(recipient) {
    setStartingRecipient(recipient);
    setSelectedMessageId(null);
    setSelectedThreadId(null);
    setActiveTab("Compose");
  }

  function sendBroadcast({ title, body, targetLabel, requiresAck }) {
    const newMessage = {
      id: Date.now(),
      type: "announcement",
      priority: requiresAck ? "ACK" : "STORE",
      title,
      from: `${currentUser.role} · ${currentUser.name}`,
      time: "Just now",
      body: `${body}\n\nTarget: ${targetLabel}`,
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
