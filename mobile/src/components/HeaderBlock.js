import { View, Text } from "react-native";
import { styles } from "../styles/styles";

export function HeaderBlock({ eyebrow, title, subtitle }) {
  return (
    <View style={styles.headerBlock}>
      <Text style={styles.headerEyebrow}>{eyebrow}</Text>
      <Text style={styles.pageTitle}>{title}</Text>
      <Text style={styles.pageSubtitle}>{subtitle}</Text>
    </View>
  );
}
