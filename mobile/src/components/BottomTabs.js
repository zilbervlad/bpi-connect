import { View, Text, TouchableOpacity } from "react-native";
import { styles } from "../styles/styles";
import { canSendBroadcast } from "../data/recipientGroups";

export function BottomTabs({ activeTab, onChangeTab, unreadCount, user }) {
  const tabs = [
    { key: "Home", label: "Home", icon: "⌂" },
    { key: "Chats", label: "Chats", icon: "✉" },
    { key: "People", label: "People", icon: "◎" },
    { key: "Compose", label: "Message", icon: "＋" },
  ];

  if (canSendBroadcast(user)) {
    tabs.push({ key: "Broadcast", label: "Send", icon: "➤" });
  }

  if (user?.role === "Admin" || user?.role === "HR") {
    tabs.push({ key: "Admin", label: "Admin", icon: "⚙" });
  }

  tabs.push({ key: "Profile", label: "Profile", icon: "●" });

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

              {tab.key === "Chats" && unreadCount > 0 && (
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
