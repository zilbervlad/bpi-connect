import { View, Text, StyleSheet } from "react-native";

export function HeaderBlock({ eyebrow, title, subtitle }) {
  return (
    <View style={localStyles.heroCard}>
      {eyebrow ? <Text style={localStyles.heroEyebrow}>{eyebrow}</Text> : null}
      {title ? <Text style={localStyles.heroTitle}>{title}</Text> : null}
      {subtitle ? <Text style={localStyles.heroSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const localStyles = StyleSheet.create({
  heroCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  heroEyebrow: {
    color: "#ef1745",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 3,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: "#10212b",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1.5,
    lineHeight: 34,
  },
  heroSubtitle: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 3,
    lineHeight: 17,
  },
});
