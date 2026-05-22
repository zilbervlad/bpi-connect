import { useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";

const currentUser = {
  name: "Vlad",
  role: "Admin",
  store: "Boston Pie",
  area: "Company",
};

const starterMessages = [
  {
    id: 1,
    type: "message",
    priority: "HIGH",
    title: "Weekend Load & Go Focus",
    from: "Operations Team",
    time: "Today · 9:15 AM",
    body: "All stores should have a certified Load Captain assigned for every rush. Focus on clean oven flow, clear dispatch, and keeping load time under control.",
    requiresAck: true,
    acknowledged: false,
    unread: true,
  },
  {
    id: 2,
    type: "announcement",
    priority: "ACK",
    title: "Image Standards Reminder",
    from: "Training Team",
    time: "Yesterday · 4:42 PM",
    body: "Managers, please review image standards with your team before Friday night. Uniforms, hats, aprons, and clean presentation matter.",
    requiresAck: true,
    acknowledged: false,
    unread: true,
  },
  {
    id: 3,
    type: "message",
    priority: "STORE",
    title: "Maintenance Follow-Up",
    from: "Facilities",
    time: "Yesterday · 1:20 PM",
    body: "Open maintenance items should be reviewed during the manager walk. Add notes if the issue is resolved or needs escalation.",
    requiresAck: false,
    acknowledged: false,
    unread: false,
  },
  {
    id: 4,
    type: "announcement",
    priority: "TRAINING",
    title: "MIT Checklist Update",
    from: "Academy",
    time: "Mon · 10:05 AM",
    body: "The MIT development checklist is being cleaned up to better track Level I, II, and III progress.",
    requiresAck: false,
    acknowledged: false,
    unread: false,
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("Home");
  const [messages, setMessages] = useState(starterMessages);
  const [selectedMessageId, setSelectedMessageId] = useState(null);

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
    setActiveTab(tab);
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

        {activeTab === "Announcements" && (
          <AnnouncementsScreen
            messages={messages.filter((message) => message.type === "announcement")}
            onOpenMessage={openMessage}
          />
        )}

        {activeTab === "Profile" && (
          <ProfileScreen user={currentUser} unreadCount={unreadCount} ackCount={ackCount} />
        )}
      </View>

      <BottomTabs activeTab={activeTab} onChangeTab={changeTab} unreadCount={unreadCount} />
    </SafeAreaView>
  );
}

function HomeScreen({ user, unreadCount, ackCount, messages, onOpenMessage, onGoInbox }) {
  const topMessages = messages.slice(0, 2);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <View style={styles.homeHero}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>BPI</Text>
        </View>

        <Text style={styles.homeEyebrow}>BPI CONNECT</Text>
        <Text style={styles.homeTitle}>Good afternoon, {user.name}.</Text>
        <Text style={styles.homeSubtitle}>
          The communication hub for Boston Pie teams.
        </Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{unreadCount}</Text>
          <Text style={styles.statLabel}>Unread</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{ackCount}</Text>
          <Text style={styles.statLabel}>Need Ack</Text>
        </View>
      </View>

      <View style={styles.quickCard}>
        <Text style={styles.sectionTitle}>Quick actions</Text>

        <TouchableOpacity style={styles.primaryButton} onPress={onGoInbox}>
          <Text style={styles.primaryButtonText}>Open Inbox</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>New Broadcast Coming Soon</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Latest updates</Text>
      </View>

      {topMessages.map((message) => (
        <MessageCard key={message.id} message={message} onPress={() => onOpenMessage(message)} />
      ))}
    </ScrollView>
  );
}

function InboxScreen({ messages, unreadCount, ackCount, onOpenMessage }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <HeaderBlock
        eyebrow="INBOX"
        title="Messages"
        subtitle={`${unreadCount} unread · ${ackCount} need acknowledgement`}
      />

      {messages.map((message) => (
        <MessageCard key={message.id} message={message} onPress={() => onOpenMessage(message)} />
      ))}
    </ScrollView>
  );
}

function AnnouncementsScreen({ messages, onOpenMessage }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <HeaderBlock
        eyebrow="ANNOUNCEMENTS"
        title="Company updates"
        subtitle="Important messages and operational updates from Boston Pie."
      />

      {messages.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No announcements yet</Text>
          <Text style={styles.emptyText}>Company announcements will show up here.</Text>
        </View>
      ) : (
        messages.map((message) => (
          <MessageCard key={message.id} message={message} onPress={() => onOpenMessage(message)} />
        ))
      )}
    </ScrollView>
  );
}

function ProfileScreen({ user, unreadCount, ackCount }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <HeaderBlock
        eyebrow="PROFILE"
        title={user.name}
        subtitle={`${user.role} · ${user.store}`}
      />

      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>V</Text>
        </View>

        <Text style={styles.profileName}>{user.name}</Text>
        <Text style={styles.profileMeta}>{user.role}</Text>
        <Text style={styles.profileMeta}>{user.area}</Text>
      </View>

      <View style={styles.profileList}>
        <View style={styles.profileRow}>
          <Text style={styles.profileRowLabel}>Unread messages</Text>
          <Text style={styles.profileRowValue}>{unreadCount}</Text>
        </View>

        <View style={styles.profileRow}>
          <Text style={styles.profileRowLabel}>Needs acknowledgement</Text>
          <Text style={styles.profileRowValue}>{ackCount}</Text>
        </View>

        <View style={styles.profileRow}>
          <Text style={styles.profileRowLabel}>Push notifications</Text>
          <Text style={styles.profileRowValue}>Coming soon</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function MessageScreen({ message, onBack, onAcknowledge }) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      <View style={styles.appHeader}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>

        <View>
          <Text style={styles.headerTitle}>Message</Text>
          <Text style={styles.headerSubtitle}>{message.from}</Text>
        </View>
      </View>

      <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
        <View style={styles.detailCard}>
          <View style={[styles.priorityPill, getPriorityStyle(message.priority)]}>
            <Text style={styles.priorityText}>{message.priority}</Text>
          </View>

          <Text style={styles.detailTitle}>{message.title}</Text>
          <Text style={styles.detailMeta}>
            From {message.from} · {message.time}
          </Text>

          <Text style={styles.detailBody}>{message.body}</Text>

          {message.requiresAck && !message.acknowledged && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => onAcknowledge(message.id)}
            >
              <Text style={styles.primaryButtonText}>Acknowledge Message</Text>
            </TouchableOpacity>
          )}

          {message.requiresAck && message.acknowledged && (
            <View style={styles.acknowledgedBox}>
              <Text style={styles.acknowledgedBoxTitle}>Acknowledged</Text>
              <Text style={styles.acknowledgedBoxText}>
                You confirmed that you read this message.
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.secondaryButton} onPress={onBack}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function HeaderBlock({ eyebrow, title, subtitle }) {
  return (
    <View style={styles.headerBlock}>
      <Text style={styles.headerEyebrow}>{eyebrow}</Text>
      <Text style={styles.pageTitle}>{title}</Text>
      <Text style={styles.pageSubtitle}>{subtitle}</Text>
    </View>
  );
}

function MessageCard({ message, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.messageCard, message.unread && styles.messageCardUnread]}
      onPress={onPress}
    >
      <View style={styles.messageTopRow}>
        <View style={styles.messageMetaLeft}>
          <Text style={styles.messageFrom}>{message.from}</Text>
          <Text style={styles.messageTime}>{message.time}</Text>
        </View>

        <View style={[styles.priorityPill, getPriorityStyle(message.priority)]}>
          <Text style={styles.priorityText}>{message.priority}</Text>
        </View>
      </View>

      <Text style={styles.messageTitle}>{message.title}</Text>
      <Text style={styles.messagePreview} numberOfLines={2}>
        {message.body}
      </Text>

      <View style={styles.messageFooterRow}>
        {message.requiresAck && !message.acknowledged ? (
          <Text style={styles.ackText}>Requires acknowledgement</Text>
        ) : message.requiresAck && message.acknowledged ? (
          <Text style={styles.ackDoneText}>Acknowledged</Text>
        ) : (
          <Text style={styles.normalText}>No acknowledgement needed</Text>
        )}

        {message.unread && <View style={styles.unreadDot} />}
      </View>
    </TouchableOpacity>
  );
}

function BottomTabs({ activeTab, onChangeTab, unreadCount }) {
  const tabs = [
    { key: "Home", label: "Home", icon: "⌂" },
    { key: "Inbox", label: "Inbox", icon: "✉" },
    { key: "Announcements", label: "News", icon: "!" },
    { key: "Profile", label: "Profile", icon: "●" },
  ];

  return (
    <View style={styles.bottomTabs}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;

        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tabButton}
            onPress={() => onChangeTab(tab.key)}
          >
            <View style={[styles.tabIconWrap, isActive && styles.tabIconWrapActive]}>
              <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>
                {tab.icon}
              </Text>

              {tab.key === "Inbox" && unreadCount > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{unreadCount}</Text>
                </View>
              )}
            </View>

            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function getPriorityStyle(priority) {
  if (priority === "HIGH") return styles.priorityHigh;
  if (priority === "ACK") return styles.priorityAck;
  if (priority === "STORE") return styles.priorityStore;
  return styles.priorityTraining;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#07111f",
  },
  appShell: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: "#07111f",
  },
  screenContent: {
    padding: 20,
    paddingBottom: 112,
  },
  homeHero: {
    backgroundColor: "#ffffff",
    borderRadius: 30,
    padding: 24,
    marginBottom: 16,
  },
  badge: {
    width: 66,
    height: 66,
    borderRadius: 22,
    backgroundColor: "#e91f3f",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -1,
  },
  homeEyebrow: {
    color: "#e91f3f",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  homeTitle: {
    color: "#10212b",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1.4,
    marginBottom: 8,
  },
  homeSubtitle: {
    color: "#526273",
    fontSize: 15,
    lineHeight: 22,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#101d2d",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  statNumber: {
    color: "#ffffff",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1,
  },
  statLabel: {
    color: "#8fa2b6",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 3,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  quickCard: {
    backgroundColor: "#ffffff",
    borderRadius: 26,
    padding: 20,
    marginBottom: 20,
  },
  sectionHeader: {
    marginTop: 4,
    marginBottom: 10,
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.6,
    marginBottom: 12,
  },
  quickCard: {
    backgroundColor: "#101d2d",
    borderRadius: 26,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  primaryButton: {
    backgroundColor: "#e91f3f",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  secondaryButton: {
    backgroundColor: "#eef5f8",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
  },
  secondaryButtonText: {
    color: "#163847",
    fontSize: 16,
    fontWeight: "900",
  },
  headerBlock: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 22,
    marginBottom: 16,
  },
  headerEyebrow: {
    color: "#e91f3f",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  pageTitle: {
    color: "#10212b",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1.3,
    marginBottom: 6,
  },
  pageSubtitle: {
    color: "#526273",
    fontSize: 15,
    lineHeight: 22,
  },
  messageCard: {
    backgroundColor: "#101d2d",
    borderRadius: 22,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  messageCardUnread: {
    borderColor: "rgba(233,31,63,0.55)",
    backgroundColor: "#132236",
  },
  messageTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 14,
  },
  messageMetaLeft: {
    flex: 1,
  },
  messageFrom: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  messageTime: {
    color: "#8597aa",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  messageTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.6,
    marginBottom: 6,
  },
  messagePreview: {
    color: "#b8c6d6",
    fontSize: 14,
    lineHeight: 21,
  },
  messageFooterRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  ackText: {
    color: "#ffb3c0",
    fontSize: 12,
    fontWeight: "900",
  },
  ackDoneText: {
    color: "#7ee0a0",
    fontSize: 12,
    fontWeight: "900",
  },
  normalText: {
    color: "#8092a6",
    fontSize: 12,
    fontWeight: "800",
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 10,
    backgroundColor: "#e91f3f",
  },
  priorityPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  priorityText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  priorityHigh: {
    backgroundColor: "#e91f3f",
  },
  priorityAck: {
    backgroundColor: "#f59e0b",
  },
  priorityStore: {
    backgroundColor: "#0089a7",
  },
  priorityTraining: {
    backgroundColor: "#24556b",
  },
  appHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: {
    color: "#ffffff",
    fontSize: 36,
    lineHeight: 38,
    fontWeight: "600",
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -1,
  },
  headerSubtitle: {
    color: "#9cadbf",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  detailCard: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 24,
  },
  detailTitle: {
    color: "#10212b",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1.2,
    marginTop: 18,
    marginBottom: 8,
  },
  detailMeta: {
    color: "#697b8d",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 22,
  },
  detailBody: {
    color: "#263847",
    fontSize: 17,
    lineHeight: 27,
    marginBottom: 18,
  },
  acknowledgedBox: {
    backgroundColor: "#ecfdf3",
    borderRadius: 18,
    padding: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  acknowledgedBoxTitle: {
    color: "#166534",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 4,
  },
  acknowledgedBoxText: {
    color: "#216b3b",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  emptyCard: {
    backgroundColor: "#101d2d",
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  emptyTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 6,
  },
  emptyText: {
    color: "#9cadbf",
    fontSize: 14,
    lineHeight: 21,
  },
  profileCard: {
    backgroundColor: "#101d2d",
    borderRadius: 28,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  profileAvatar: {
    width: 76,
    height: 76,
    borderRadius: 28,
    backgroundColor: "#e91f3f",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  profileAvatarText: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "900",
  },
  profileName: {
    color: "#ffffff",
    fontSize: 26,
    fontWeight: "900",
    marginBottom: 4,
  },
  profileMeta: {
    color: "#9cadbf",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 2,
  },
  profileList: {
    backgroundColor: "#101d2d",
    borderRadius: 24,
    padding: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  profileRow: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  profileRowLabel: {
    color: "#b8c6d6",
    fontSize: 14,
    fontWeight: "800",
  },
  profileRowValue: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  bottomTabs: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
    backgroundColor: "rgba(16,29,45,0.96)",
    borderRadius: 28,
    paddingVertical: 10,
    paddingHorizontal: 8,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  tabIconWrap: {
    width: 38,
    height: 34,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  tabIconWrapActive: {
    backgroundColor: "#e91f3f",
  },
  tabIcon: {
    color: "#9cadbf",
    fontSize: 18,
    fontWeight: "900",
  },
  tabIconActive: {
    color: "#ffffff",
  },
  tabLabel: {
    color: "#8fa2b6",
    fontSize: 11,
    fontWeight: "900",
  },
  tabLabelActive: {
    color: "#ffffff",
  },
  tabBadge: {
    position: "absolute",
    right: -4,
    top: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    color: "#e91f3f",
    fontSize: 10,
    fontWeight: "900",
  },
});
