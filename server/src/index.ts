import { Lifecycle } from '@well-known-components/interfaces'

import { initComponents } from './components'
import { main } from './service'

// Program entry point — delegates to the WKC Lifecycle runner.
Lifecycle.run({ main, initComponents })
