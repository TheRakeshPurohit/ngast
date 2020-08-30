import { WorkspaceSymbols } from './workspace.symbols';
import { ClassDeclaration, Decorator } from '@angular/compiler-cli/src/ngtsc/reflection';
import { Declaration } from 'typescript';
import { TraitState, Trait, AnalyzedTrait, ResolvedTrait } from '@angular/compiler-cli/src/ngtsc/transform';
import { R3DependencyMetadata } from '@angular/compiler';
import { AnnotationNames } from './utils';
import { FactoryOutput } from './find-symbol';
import { NgModuleAnalysis } from '@angular/compiler-cli/src/ngtsc/annotations/src/ng_module';
import { PipeHandlerData } from '@angular/compiler-cli/src/ngtsc/annotations/src/pipe';
import { InjectableHandlerData } from '@angular/compiler-cli/src/ngtsc/annotations/src/injectable';
import { DirectiveHandlerData } from '@angular/compiler-cli/src/ngtsc/annotations/src/directive';
import { ComponentAnalysisData } from '@angular/compiler-cli/src/ngtsc/annotations/src/component';

const handlerName = {
  'NgModule': 'NgModuleDecoratorHandler',
  'Pipe': 'PipeDecoratorHandler',
  'Injectable': 'InjectableDecoratorHandler',
  'Directive': 'DirectiveDecoratorHandler',
  'Component': 'ComponentDecoratorHandler'
} as const;

export interface HandlerData {
  'NgModuleDecoratorHandler': NgModuleAnalysis,
  'PipeDecoratorHandler': PipeHandlerData,
  'InjectableDecoratorHandler': InjectableHandlerData,
  'DirectiveDecoratorHandler': DirectiveHandlerData,
  'ComponentDecoratorHandler': ComponentAnalysisData,
}

type GetHandlerData<A extends keyof typeof handlerName> = HandlerData[(typeof handlerName)[A]];
type GetTrait<A extends keyof typeof handlerName> = Trait<Decorator, GetHandlerData<A>, unknown>

export const filterByHandler = <A extends AnnotationNames>(annotation: A) => (trait: Trait<Decorator, any, unknown>): trait is GetTrait<A> => {
  return trait.handler.name === handlerName[annotation];
};

export const isAnalysed = <A, B, C>(trait?: Trait<A, B, C>): trait is AnalyzedTrait<A, B, C> | ResolvedTrait<A, B, C> => {
  return trait?.state === TraitState.ANALYZED || this.trait?.state === TraitState.RESOLVED;
}

export abstract class Symbol<AnalysisData> {
  protected readonly abstract annotation: AnnotationNames;
  protected readonly abstract deps: R3DependencyMetadata[] | 'invalid' | null;
  private _trait?: Trait<Decorator, AnalysisData, unknown>;

  constructor(
    protected workspace: WorkspaceSymbols,
    public node: ClassDeclaration<Declaration>,
  ) {}

  get name() {
    return this.node.name.getText();
  }

  get diagnostics() {
    return this.trait?.state === TraitState.ERRORED ? this.trait.diagnostics : null;
  }

  get isAnalysed() {
    return isAnalysed(this.trait);
  }

  get record() {
    return this.workspace.traitCompiler?.recordFor(this.node);
  }

  get analysis(): AnalysisData {
    this.ensureAnalysis();
    if (this.trait?.state === TraitState.ERRORED) {
      const message = `An error occurred during analysis of "${this.name}". `;
      const solution = `Check diagnostics in [${this.annotation}Symbol].diagnostics. `;
      throw new Error(message + solution);
    }
    // As we analyzed the node above it should be ok...
    if (isAnalysed(this.trait)) {
      return this.trait.analysis;
    } else {
      throw new Error(`Analysis for node ${this.name} couldn't be completed`);
    }
  }

  protected get trait() {
    if (!this._trait) {
      this._trait = this.record?.traits.find(filterByHandler(this.annotation)) as any;
    }
    return this._trait;
  }

  public analyse() {
    this.workspace.traitCompiler?.analyzeNode(this.node);
    this.workspace.traitCompiler?.resolveNode(this.node);
    // @question should we record NgModule Scope dependencies here ???
    this._trait = this.record?.traits.find(filterByHandler(this.annotation)) as any;
  }


  protected ensureAnalysis() {
    if (!this.record) {
      this.analyse();
    }
  }

  public isSymbol<A extends AnnotationNames>(name: A): this is FactoryOutput<A> {
    return this.annotation === name;
  }
}
