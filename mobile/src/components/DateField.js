import { useMemo, useState } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

function parseDateValue(value) {
  if (!value) return new Date();

  const parts = String(value).split("-").map(Number);

  if (
    parts.length === 3 &&
    Number.isFinite(parts[0]) &&
    Number.isFinite(parts[1]) &&
    Number.isFinite(parts[2])
  ) {
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDisplayDate(value) {
  if (!value) return "";

  const date = parseDateValue(value);

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DateField({
  value,
  onChange,
  placeholder = "Select date",
  minimumDate,
  maximumDate,
  style,
}) {
  const [visible, setVisible] = useState(false);
  const [draftDate, setDraftDate] = useState(() =>
    parseDateValue(value)
  );

  const selectedDate = useMemo(
    () => parseDateValue(value),
    [value]
  );

  function openPicker() {
    setDraftDate(selectedDate);
    setVisible(true);
  }

  function handleAndroidChange(event, date) {
    setVisible(false);

    if (event.type === "dismissed" || !date) {
      return;
    }

    onChange(formatIsoDate(date));
  }

  function handleIosChange(_event, date) {
    if (date) {
      setDraftDate(date);
    }
  }

  if (Platform.OS === "android") {
    return (
      <>
        <TouchableOpacity
          style={[localStyles.field, style]}
          onPress={openPicker}
          activeOpacity={0.8}
        >
          <Text
            style={[
              localStyles.value,
              !value && localStyles.placeholder,
            ]}
          >
            {value ? formatDisplayDate(value) : placeholder}
          </Text>

          <Text style={localStyles.icon}>📅</Text>
        </TouchableOpacity>

        {visible ? (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="calendar"
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onChange={handleAndroidChange}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={[localStyles.field, style]}
        onPress={openPicker}
        activeOpacity={0.8}
      >
        <Text
          style={[
            localStyles.value,
            !value && localStyles.placeholder,
          ]}
        >
          {value ? formatDisplayDate(value) : placeholder}
        </Text>

        <Text style={localStyles.icon}>📅</Text>
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={localStyles.overlay}>
          <View style={localStyles.modalCard}>
            <Text style={localStyles.modalTitle}>
              Select date
            </Text>

            <DateTimePicker
              value={draftDate}
              mode="date"
              display="inline"
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              onChange={handleIosChange}
            />

            <View style={localStyles.actions}>
              <TouchableOpacity
                style={localStyles.cancelButton}
                onPress={() => setVisible(false)}
              >
                <Text style={localStyles.cancelText}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={localStyles.doneButton}
                onPress={() => {
                  onChange(formatIsoDate(draftDate));
                  setVisible(false);
                }}
              >
                <Text style={localStyles.doneText}>
                  Done
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const localStyles = StyleSheet.create({
  field: {
    minHeight: 48,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#dce4eb",
    backgroundColor: "#f3f6f8",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  value: {
    color: "#10212b",
    fontWeight: "800",
    fontSize: 14,
  },
  placeholder: {
    color: "#8191a1",
  },
  icon: {
    fontSize: 18,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 22,
    backgroundColor: "#ffffff",
    padding: 16,
  },
  modalTitle: {
    color: "#10212b",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  cancelButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: "#e8eef3",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    color: "#526476",
    fontWeight: "900",
  },
  doneButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: "#e91f3f",
    alignItems: "center",
    justifyContent: "center",
  },
  doneText: {
    color: "#ffffff",
    fontWeight: "900",
  },
});
