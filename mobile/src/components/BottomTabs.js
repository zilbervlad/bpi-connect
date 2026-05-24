import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { canSendBroadcast } from "../data/recipientGroups";

export function BottomTabs({ activeTab, onChangeTab, unreadCount, user }) {
  const tabs = [
    { key: "Home", label: "Home", icon: "⌂" },
    { key: "Chats", label: "Chats", icon: "●", badge: unreadCount },
    { key: "People", label: "People", icon: "○" },
  ];

  if (canSendBroadcast(user)) {
    tabs.push({ key: "Broadcast", label: "Send", icon: "➤" });
  }

  tabs.push({ key: "More", label: "More", icon: "•••" });

  return (
    <View style={localStyles.wrap}>
      {tabs.map((tab) => {
        const isActive =
          activeTab === tab.key ||
          (tab.key === "More" && ["Admin", "Profile"].includes(activeTab));

        return (
          <TouchableOpacity
            key={tab.key}
            style={[localStyles.tab, isActive && localStyles.tabActive]}
            onPress={() => onChangeTab(tab.key)}
            activeOpacity={0.82}
          >
            <View style={[localStyles.iconBubble, isActive && localStyles.iconBubbleActive]}>
              <Text style={[localStyles.iconText, isActive && localStyles.iconTextActive]}>
                {tab.icon}
              </Text>

              {tab.badge > 0 && (
                <View style={localStyles.badge}>
                  <Text style={localStyles.badgeText}>{tab.badge}</Text>
                </View>
              )}
            </View>

            <Text style={[localStyles.label, isActive && localStyles.labelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const localStyles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
    backgroundColor: "rgba(16, 29, 45, 0.96)",
    borderRadius: 34,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 5,
  },
  tabActive: {},
  iconBubble: {
    width: 42,
    height: 42,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  iconBubbleActive: {
    backgroundColor: "#e91f3f",
  },
  iconText: {
    color: "#9cadbf",
    fontSize: 19,
    fontWeight: "900",
  },
  iconTextActive: {
    color: "#ffffff",
  },
  label: {
    color: "#8fa1b6",
    fontSize: 11,
    fontWeight: "900",
  },
  labelActive: {
    color: "#ffffff",
  },
  badge: {
    position: "absolute",
    right: -3,
    top: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeText: {
    color: "#e91f3f",
    fontSize: 10,
    fontWeight: "900",
  },
});
