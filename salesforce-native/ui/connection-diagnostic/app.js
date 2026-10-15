import {App,applyDocumentTheme,applyHostStyleVariables} from '@modelcontextprotocol/ext-apps';
import {mountDiagnostic} from './controller.mjs';
const app=new App({name:'Cardstack connection diagnostic',version:'1.0.0'});
function hostStyles(context) {
 if(context.theme)applyDocumentTheme(context.theme);
 if(context.styles?.variables)applyHostStyleVariables(context.styles.variables);
 if(context.safeAreaInsets){const {top,right,bottom,left}=context.safeAreaInsets;document.body.style.padding=[top,right,bottom,left].map(n=>`${Number.isFinite(n)?Math.max(0,Math.min(100,n)):0}px`).join(' ');}
}
mountDiagnostic(app,document,{hostStyles});
addEventListener('pagehide',()=>app.close(),{once:true});
