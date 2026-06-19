import { View, Text, TouchableOpacity, ScrollView,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

import { styles } from "../styles/styles";
import { uploadApiUserAvatar } from "../api/client";
import { HeaderBlock } from "../components/HeaderBlock";
import { UserAvatar } from "../components/UserAvatar";
import { canSendBroadcast } from "../data/recipientGroups";

export function ProfileScreen({ user, unreadCount, ackCount, onLogout, onUserUpdated, onDeleteAccount }) {
  async function handleChangeProfilePicture() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        alert("Photo access is needed to choose a profile picture.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.72,
      });

      if (result.canceled || !result.assets?.[0]?.uri) {
        return;
      }

      const asset = result.assets[0];

      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: "base64",
        deleteAccountButton: {
    marginTop: 16,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    alignItems: "center",
  },
  deleteAccountButtonText: {
    color: "#be123c",
    fontSize: 14,
    fontWeight: "900",
  },
});

      const mimeType = asset.mimeType || "image/jpeg";
      const imageData = `data:${mimeType};base64,${base64}`;

      const updatedUser = await uploadApiUserAvatar(user.id, imageData);
      onUserUpdated?.(updatedUser);

      alert("Profile picture updated.");
    } catch (error) {
      alert(error.message || "Could not update profile picture.");
    }
  }

  function handleDeleteAccountPress() {
    Alert.alert(
      "Delete My Account?",
      "This will remove your access to BPI Connect and delete personal contact information from your account. Message history may remain for business records.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: async () => {
            try {
              await onDeleteAccount?.("DELETE");
            } catch (error) {
              Alert.alert("Could not delete account", error.message || "Please try again.");
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <HeaderBlock
        eyebrow="PROFILE"
        title={user.name}
        subtitle={`${user.role} · ${user.store || user.area || "Company"}`}
      />

      <View style={styles.profileCard}>
        <UserAvatar user={user} size={82} />

        <Text style={styles.profileName}>{user.name}</Text>
        <Text style={styles.profileMeta}>{user.email}</Text>
        <Text style={styles.profileMeta}>
          {user.role} · {user.store_name || user.store || user.area || "Company"}
        </Text>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleChangeProfilePicture}>
          <Text style={styles.secondaryButtonText}>Change Profile Picture</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.profileList}>
        <View style={styles.profileRow}>
          <Text style={styles.profileRowLabel}>Unread chats</Text>
          <Text style={styles.profileRowValue}>{unreadCount}</Text>
        </View>

        <View style={styles.profileRow}>
          <Text style={styles.profileRowLabel}>Needs Response</Text>
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
          <Text style={styles.profileRowValue}>Managed by phone settings</Text>
        </View>
      </View>

      <View style={styles.quickCard}>
        <Text style={styles.sectionTitle}>Account</Text>
        <TouchableOpacity style={styles.deleteAccountButton} onPress={handleDeleteAccountPress}>
          <Text style={styles.deleteAccountButtonText}>Delete My Account</Text>
        </TouchableOpacity>



        <TouchableOpacity style={styles.primaryButton} onPress={onLogout}>
          <Text style={styles.primaryButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
