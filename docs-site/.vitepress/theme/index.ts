import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import ParticleCanvas from "./ParticleCanvas.vue";
import "./custom.css";
import "./home.css";

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'home-hero-before': () => h(ParticleCanvas),
    });
  },
};
