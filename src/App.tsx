import React, { useEffect, useRef, useState } from 'react';

import {
  Platform,
  SafeAreaView,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';

import { Colors } from 'react-native/Libraries/NewAppScreen';

import { readFile, readFileAssets, unlink } from '@dr.pogodin/react-native-fs';

import { WebView } from 'react-native-webview';

import Server, {
  STATES,
  extractBundledAssets,
  resolveAssetsPath,
} from '@dr.pogodin/react-native-static-server';

export default function App() {
  const isDarkMode = useColorScheme() === 'dark';

  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
    flex: 1,
  };

  // Once the server is ready, the origin will be set and opened by WebView.
  const [origin, setOrigin] = useState<string>('');

  useEffect(() => {
    const fileDir = resolveAssetsPath('webroot');

    // In our example, `server` is reset to null when the component is unmount,
    // thus signalling that server init sequence below should be aborted, if it
    // is still underway.
    let server: null | Server = new Server({
      fileDir,

      // Note: Inside Android emulator the IP address 10.0.2.15 corresponds
      // to the emulated device network or ethernet interface, which can be
      // connected to from the host machine, following instructions at:
      // https://developer.android.com/studio/run/emulator-networking#consoleredir
      // hostname: '10.0.2.15', // Android emulator ethernet interface.
      hostname: '127.0.0.1', // This is just the local loopback address.

      // The fixed port is just more convenient for library development &
      // testing.
      port: 3000,

      stopInBackground: true,

      // These settings enable all available debug options for Lighttpd core,
      // to facilitate library development & testing with the example app.
      errorLog: {
        conditionHandling: true,
        fileNotFound: true,
        requestHandling: true,
        requestHeader: true,
        requestHeaderOnError: true,
        responseHeader: true,
        timeouts: true,
      },

      // This is to enable WebDAV for /dav... routes. To use, you should also
      // opt-in for building the library with WebDAV support enabled
      // (see README for details).
      // webdav: ['^/dav($|/)'],

      extraConfig: `
        server.modules += ("mod_alias")
        alias.url = (
          "/some/path" => "${fileDir}"
        )
      `,
    });
    const serverId = server.id;

    (async () => {
      // On Android we should extract web server assets from the application
      // package, and in many cases it is enough to do it only on the first app
      // installation and subsequent updates. In our example we'll compare
      // the content of "version" asset file with its extracted version,
      // if it exist, to deside whether we need to re-extract these assets.
      if (Platform.OS === 'android') {
        let extract = true;
        try {
          const versionD = await readFile(`${fileDir}/version`, 'utf8');
          const versionA = await readFileAssets('webroot/version', 'utf8');
          if (versionA === versionD) {
            extract = false;
          } else {
            await unlink(fileDir);
          }
        } catch {
          // A legit error happens here if assets have not been extracted
          // before, no need to react on such error, just extract assets.
        }
        if (extract) {
          console.log('Extracting web server assets...');
          await extractBundledAssets(fileDir, 'webroot');
        }
      }

      server?.addStateListener((newState, details, error) => {
        // Depending on your use case, you may want to use such callback
        // to implement a logic which prevents other pieces of your app from
        // sending any requests to the server when it is inactive.

        // Here `newState` equals to a numeric state constant,
        // and `STATES[newState]` equals to its human-readable name,
        // because `STATES` contains both forward and backward mapping
        // between state names and corresponding numeric values.
        console.log(
          `Server #${serverId}.\n`,
          `Origin: ${server?.origin}`,
          `New state: "${STATES[newState]}".\n`,
          `Details: "${details}".`,
        );
        if (error) console.error(error);
      });
      const res = await server?.start();
      if (res && server) {
        setOrigin(res);
      }
    })();
    return () => {
      (async () => {
        // In our example, here is no need to wait until the shutdown completes.
        server?.stop();

        server = null;
        setOrigin('');
      })();
    };
  }, []);

  const webView = useRef<WebView>(null);

  return (
    <SafeAreaView style={backgroundStyle}>
      <View style={styles.webview}>
        <WebView
          source={origin ? {uri: origin} : { html: 'html render' }}
          allowFileAccessFromFileURLs={true}
          domStorageEnabled={true}
          allowFileAccess={true}
          allowUniversalAccessFromFileURLs={true}
          originWhitelist={['*']}
          onShouldStartLoadWithRequest={() => true}
          javaScriptEnabledAndroid={true}
          mixedContentMode="always"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 18,
    fontWeight: '400',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  webview: {
    borderColor: 'black',
    borderWidth: 1,
    flex: 1
  },
});
