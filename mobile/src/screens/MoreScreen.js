import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { styles } from "../styles/styles";
import { HeaderBlock } from "../components/HeaderBlock";
import { UserAvatar } from "../components/UserAvatar";

export function MoreScreen({ user, unreadCount, ackCount, onOpenAdmin, onOpenProfile, onLogout }) {
  const canOpenAdmin = ["Admin", "HR"].includes(user.role);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <HeaderBlock
        eyebrow="MORE"
        title="Settings & tools"
        subtitle={`${user.name} · ${user.role}`}
      />

      <View style={localStyles.profileCard}>
        <UserAvatar user={user} size={38} />

        <View style={localStyles.profileMain}>
          <Text style={localStyles.profileName}>{user.name}</Text>
          <Text style={localStyles.profileMeta}>{user.role} · {user.store || user.area || "Company"}</Text>
        </View>
      </View>

      <View style={localStyles.statsRow}>
        <View style={localStyles.statBox}>
          <Text style={localStyles.statValue}>{unreadCount}</Text>
          <Text style={localStyles.statLabel}>Unread</Text>
        </View>

        <View style={localStyles.statBox}>
          <Text style={localStyles.statValue}>{ackCount}</Text>
          <Text style={localStyles.statLabel}>Response</Text>
        </View>
      </View>

      <View style={localStyles.card}>
        <Text style={localStyles.sectionTitle}>Tools</Text>

        {canOpenAdmin && (
          <TouchableOpacity style={localStyles.row} onPress={onOpenAdmin}>
            <View>
              <Text style={localStyles.rowTitle}>Admin Command Center</Text>
              <Text style={localStyles.rowMeta}>Manage people, stores, areas, and access</Text>
            </View>
            <Text style={localStyles.chevron}>›</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={localStyles.row} onPress={onOpenProfile}>
          <View>
            <Text style={localStyles.rowTitle}>Profile</Text>
            <Text style={localStyles.rowMeta}>View account details</Text>
          </View>
          <Text style={localStyles.chevron}>›</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={localStyles.signOutButton} onPress={onLogout}>
        <Text style={localStyles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const localStyles = StyleSheet.create({
  profileCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 12,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: "#e91f3f",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  profileMain: {
    flex: 1,
  },
  profileName: {
    color: "#10212b",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  profileMeta: {
    color: "#697b8d",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 3,
  },
  statsRow: {
    flexDirection: "row",
    gap: 7,
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#101d2d",
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  statValue: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1,
  },
  statLabel: {
    color: "#9cadbf",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    marginTop: 4,
  },
  card: {
    backgroundColor: "#101d2d",
    borderRadius: 18,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: -0.7,
    marginBottom: 10,
  },
  row: {
    backgroundColor: "rgba(255,255,255,0.055)",
    borderRadius: 18,
    padding: 12,
    marginTop: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  rowTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  rowMeta: {
    color: "#9cadbf",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  chevron: {
    color: "#9cadbf",
    fontSize: 15,
    fontWeight: "500",
  },
  signOutButton: {
    backgroundColor: "#ffe4e8",
    borderRadius: 20,
    paddingVertical: 6,
    alignItems: "center",
    marginBottom: 110,
  },
  signOutText: {
    color: "#991b2f",
    fontSize: 15,
    fontWeight: "900",
  },
});
