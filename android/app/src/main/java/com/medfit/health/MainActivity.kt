package com.medfit.health

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        // Register our custom HealthPlugin BEFORE calling super.onCreate()
        // so Capacitor picks it up and exposes it to JavaScript as
        // window.Capacitor.Plugins.HealthConnect
        registerPlugin(HealthPlugin::class.java)

        super.onCreate(savedInstanceState)
    }
}