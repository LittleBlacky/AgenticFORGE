import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import HomeLayout from "./HomeLayout.vue";
import "./custom.css";
import "./home.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }: { app: any }) {
    app.component('HomeLayout', HomeLayout);
  },
};
