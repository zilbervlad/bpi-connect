import { View, Text, TouchableOpacity } from "react-native";
import { styles } from "../styles/styles";

export function BottomTabs({ activeTab, onChangeTab, unreadCount }) {
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
