import { mount } from 'svelte'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/hanken-grotesk'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
