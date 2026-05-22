import { useState } from "react";
import { SafeAreaView, View } from "react-native";
import { StatusBar } from "expo-status-bar";

import { styles } from "./src/styles/styles";
import { demoUsers } from "./src/data/users";
import { starterMessages } from "./src/data/messages";

import { BottomTabs } from "./src/components/BottomTabs";

import { HomeScreen } from "./src/screens/HomeScreen";
import { InboxScreen } from "./src/screens/InboxScreen";
import { AnnouncementsScreen } from "./src/screens/AnnouncementsScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { MessageScreen } from "./src/screens/MessageScreen";
import { BroadcastScreen } from "./src/screens/BroadcastScreen";
import { ComposeScreen } from "./src/screens/ComposeScreen";
import { PeopleScreen } from "./src/screens/PeopleScreen";

export default function App() {
  const [activeTab, setActiveTab] = useState("Home");
  const [currentUser, setCurrentUser] = useState(demoUsers[0]);
  const [messages, setMessages] = useState(starterMessages);
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [startingRecipient, setStartingRecipient] = useState(null);

  const selectedMessage = messages.find((message) => message.id === selectedMessageId);
  const unreadCount = messages.filter((message) => message.unread).length;
  const ackCount = messages.filter(
    (message) => message.requiresAck && !message.acknowledged
  ).length;

  function openMessage(message) {
    setMessages((currentMessages) =>
      currentMessages.map((item) =>
        item.id === message.id ? { ...item, unread: false } : item
      )
    );

    setSelectedMessageId(message.id);
  }

  function closeMessage() {
    setSelectedMessageId(null);
  }

  function acknowledgeMessage(messageId) {
    setMessages((currentMessages) =>
      currentMessages.map((item) =>
        item.id === messageId
          ? { ...item, acknowledged: true, unread: false }
          : item
      )
    );
  }

  function changeTab(tab) {
    setSelectedMessageId(null);

    if (tab !== "Compose") {
      setStartingRecipient(null);
    }

    setActiveTab(tab);
  }

  function switchUser(user) {
    setCurrentUser(user);
    setSelectedMessageId(null);
    setStartingRecipient(null);
    setActiveTab("Home");
  }

  function startMessageToRecipient(recipient) {
    setStartingRecipient(recipient);
    setSelectedMessageId(null);
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
    const newMessage = {
      id: Date.now(),
      type: "message",
      priority: "DM",
      title: `Private message to ${recipient.name}`,
      from: `${currentUser.role} · ${currentUser.name}`,
      time: "Just now",
      body: `${body}\n\nTo: ${recipient.name} · ${recipient.store}`,
      requiresAck: false,
      acknowledged: false,
      unread: true,
    };

    setMessages((currentMessages) => [newMessage, ...currentMessages]);
    setStartingRecipient(null);
    setActiveTab("Inbox");
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
            onGoInbox={() => changeTab("Inbox")}
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
            onStartMessage={startMessageToRecipient}
          />
        )}

        {activeTab === "Compose" && (
          <ComposeScreen
            user={currentUser}
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
