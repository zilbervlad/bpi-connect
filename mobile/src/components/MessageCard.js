import { View, Text, TouchableOpacity } from "react-native";
import { styles, getPriorityStyle } from "../styles/styles";

export function MessageCard({ message, onPress }) {
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
