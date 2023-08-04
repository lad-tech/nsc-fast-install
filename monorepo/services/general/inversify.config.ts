import { AuthToolkit } from 'general/AuthToolkit';

import { Configurator } from 'general/Configurator';
import { TYPES } from 'general/inversify.types';
import { Container } from 'inversify';
import 'reflect-metadata';

const container = new Container({ defaultScope: 'Singleton', skipBaseClassChecks: true });

container.bind<AuthToolkit>(TYPES.AuthToolkit).to(AuthToolkit);
container.bind<Configurator>(TYPES.Configurator).to(Configurator);

export { container, TYPES };
