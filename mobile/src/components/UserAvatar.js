import { Image, Text, View, StyleSheet } from "react-native";

export function UserAvatar({ user, name, avatarUrl, size = 44, style }) {
  const displayName = name || user?.name || "User";
  const imageUrl = avatarUrl || user?.avatar_url || user?.avatarUrl;

  const initials = getInitials(displayName);
  const radius = Math.round(size * 0.38);

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[
          localStyles.avatarImage,
          {
            width: size,
            height: size,
            borderRadius: radius,
          },
          style,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        localStyles.avatarFallback,
        {
          width: size,
          height: size,
          borderRadius: radius,
        },
        style,
      ]}
    >
      <Text
        style={[
          localStyles.avatarText,
          {
            fontSize: Math.max(12, Math.round(size * 0.36)),
          },
        ]}
      >
        {initials}
      </Text>
    </View>
  );
}

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "?";

  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }

  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
}

const localStyles = StyleSheet.create({
  avatarFallback: {
    backgroundColor: "#e91f3f",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    backgroundColor: "#dbe5ee",
  },
  avatarText: {
    color: "#ffffff",
    fontWeight: "900",
  },
});
