import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { styles } from "../styles/styles";
import { HeaderBlock } from "../components/HeaderBlock";
import { canSendBroadcast } from "../data/recipientGroups";

export function ProfileScreen({ user, unreadCount, ackCount, onLogout }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <HeaderBlock
        eyebrow="PROFILE"
        title={user.name}
        subtitle={`${user.role} · ${user.store}`}
      />

      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>{user.name.charAt(0)}</Text>
        </View>

        <Text style={styles.profileName}>{user.name}</Text>
        <Text style={styles.profileMeta}>{user.role}</Text>
        <Text style={styles.profileMeta}>{user.area}</Text>
      </View>

      <View style={styles.profileList}>
        <View style={styles.profileRow}>
          <Text style={styles.profileRowLabel}>Unread chats</Text>
          <Text style={styles.profileRowValue}>{unreadCount}</Text>
        </View>

        <View style={styles.profileRow}>
          <Text style={styles.profileRowLabel}>Needs acknowledgement</Text>
          <Text style={styles.profileRowValue}>{ackCount}</Text>
        </View>

        <View style={styles.profileRow}>
          <Text style={styles.profileRowLabel}>Can post to groups</Text>
          <Text style={styles.profileRowValue}>
            {canSendBroadcast(user) ? "Yes" : "No"}
          </Text>
        </View>

        <View style={styles.profileRow}>
          <Text style={styles.profileRowLabel}>Push notifications</Text>
          <Text style={styles.profileRowValue}>Coming soon</Text>
        </View>
      </View>

      <View style={styles.quickCard}>
        <Text style={styles.sectionTitle}>Account</Text>

        <TouchableOpacity style={styles.primaryButton} onPress={onLogout}>
          <Text style={styles.primaryButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
