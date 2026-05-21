import Reactotron from "reactotron-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

Reactotron.setAsyncStorageHandler(AsyncStorage)
  .configure({
    name: "React Native Demo",
  })
  .useReactNative({
    asyncStorage: true, 
    networking: {
      // optionally, you can turn it off with false.
      ignoreUrls: /symbolicate/,
    },
    editor: false, // there are more options to editor
    errors: { veto: (stackFrame) => false }, // or turn it off with false
    overlay: false, // just turning off overlay
  })
  .connect();

Reactotron.onCustomCommand({
  command: 'Dump AsyncStorage',
  handler: async () => {
    const keys = await AsyncStorage.getAllKeys();
    const stores = await AsyncStorage.multiGet(keys);
    const obj = Object.fromEntries(stores);
    Reactotron.display({
      name: 'ASYNC STORAGE',
      value: obj,
      preview: `${keys.length} keys`,
    });
  },
});

