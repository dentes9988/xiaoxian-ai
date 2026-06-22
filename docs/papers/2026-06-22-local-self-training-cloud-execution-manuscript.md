# Local Self-Training, Cloud Execution: A User-Sovereign Architecture for Personal AI Companions

Author: Hengbin Liu  
Affiliation: Qyuan AI  
Project artifact: `xiaoxian AI` ([GitHub](https://github.com/dentes9988/xiaoxian-ai))

## Abstract

Personal AI assistants are becoming increasingly capable at conversation and task execution, yet they still struggle to develop durable, privacy-preserving understanding of one concrete user over time. Centralized platforms can collect large amounts of user data, but this architecture creates a tension between personalization and user sovereignty: the more the system knows, the more sensitive the data becomes, and the less willing many users are to contribute the full material of their lives. This paper proposes a user-sovereign architecture for personal AI companions that separates short-horizon intelligence from long-horizon personal adaptation. In the proposed design, a stronger online large language model handles live conversation, instruction return, structured extraction, and tool orchestration, while a smaller local model maintains the user’s long-term private adaptation through local organization, revision, and periodic fine-tuning. We argue that this division of labor offers a more practical path toward human-centered personalization than either pure cloud intelligence or pure on-device general intelligence alone. We describe the design principles, memory model, confirmation workflow, prior translation layer, and implementation of an open-source prototype, `xiaoxian AI`, for macOS. The paper contributes (1) an architectural pattern for privacy-preserving personal AI, (2) a model of time-aware and user-correctable self-representation, and (3) a design argument for AI systems that support human self-understanding rather than replacing personal agency.

## Keywords

Personal AI; human-centered AI; privacy-preserving AI; local fine-tuning; self-modeling; digital companionship; user sovereignty

## 1. Introduction

Large language models have dramatically improved the quality of conversational systems, planning support, summarization, and tool use. However, a persistent limitation remains: most systems are still much better at being generally intelligent than at becoming deeply, durably, and respectfully personalized for a single user. They may remember fragments, infer temporary preferences, or simulate continuity through long-context prompting, but this does not yet amount to a robust, inspectable, and revisable model of the person they serve.

This limitation is not merely technical. It is also architectural and social. A platform seeking deep personalization tends to accumulate increasingly intimate personal data: conversations, preferences, relationship details, emotional history, work habits, and patterns of decision-making. Yet the more intimate these materials become, the less acceptable it is for them to be permanently centralized, opaquely modeled, or silently reused for other purposes. In other words, personalization and privacy often scale against one another in mainstream cloud-centered designs.

This paper starts from a different premise: a personal AI should not merely optimize responses, but help a user gradually build a more accurate understanding of themselves while retaining sovereignty over the memory, revision process, and long-term training material involved. Under this view, the assistant is not a platform-defined identity engine; it is a collaborative self-modeling system.

We present an architectural argument and an open-source prototype, `xiaoxian AI`, that operationalize this premise. The system divides responsibilities between two model regimes. A stronger online model is used for live interaction: conversation, instruction return, memory candidate extraction, and tool handling. A smaller local model is used for private long-term adaptation: organizing daily material, consolidating memory, and performing periodic local fine-tuning on user-specific data. This architecture is motivated by three needs: immediate capability, long-term personalization, and privacy preservation.

The central claim of this paper is that personal AI systems should treat user-specific understanding as a locally governed asset rather than a purely platform-owned inference product. This claim is implemented through a set of design principles: time-aware memory, explicit confirmation of high-impact self-model changes, low-authority priors for cold start, and an interaction model aimed at supporting self-understanding and decision reflection rather than deterministic identity labeling.

## 2. Background and Motivation

Human-centered AI research has emphasized that AI systems should be reliable, safe, trustworthy, understandable, and aligned with human goals and contexts. At the same time, privacy-preserving machine learning has shown that useful adaptation does not always require centralizing raw data. Yet most consumer-facing AI assistants still rely heavily on cloud-based general-purpose intelligence, with personalization handled through prompts, server-side memory layers, retrieval, or profile settings.

These approaches are useful but insufficient for long-horizon personal assistance for at least three reasons.

First, a long external memory store tends to grow faster than the system’s ability to maintain precision. Without careful revision, provenance, and salience control, more memory can reduce relevance rather than improve it.

Second, many aspects of self-understanding are time-dependent. A person’s stress patterns, work style, relationships, and motivational tensions can change substantially across months or years. Storing “facts about the user” without temporal context can produce false continuity.

Third, highly personal adaptation introduces a governance problem. A model that knows the user well enough to influence life decisions should not update critical identity assumptions silently. If a system concludes that the user “prioritizes money over connection,” “avoids authority,” or “recovers through solitude,” these judgments may shape future advice. Such claims therefore require inspection and, at times, explicit confirmation.

The `xiaoxian AI` design addresses these issues by moving the center of gravity from platform memory to user-governed self-modeling. The goal is not only better recommendations, but a healthier relationship between human continuity and machine assistance.

## 3. Research Position

This work is best understood as a design and systems position paper, instantiated through a working open-source prototype. It does not claim that the full approach has already been validated through a longitudinal controlled study. Rather, it contributes a testable architecture and a set of design hypotheses for future evaluation.

The paper asks:

1. How can a personal AI system become more individually adaptive without centralizing the user’s private long-term data?
2. What should be stored as external memory versus trained into a local personalized model?
3. How can self-model updates remain useful without becoming deterministic identity labels?
4. What interaction patterns help an assistant understand a person better while still preserving user agency?

## 4. Architectural Proposal

### 4.1 Division of Labor Between Models

The proposed architecture separates online execution from local adaptation.

The online model is responsible for:

- real-time conversation
- instruction return
- structured extraction from each dialogue turn
- planning and tool invocation
- higher-quality natural language interpretation

The local model is responsible for:

- organizing user-specific training material
- summarizing and consolidating daily changes
- maintaining private adaptation assets
- periodic fine-tuning during idle or nighttime intervals
- supporting later retrieval and interpretation through a user-specific lens

This arrangement is not presented as a rejection of strong cloud models. On the contrary, it assumes that cloud models are currently better at general language competence and tool reasoning. The argument is instead that personal continuity should accumulate locally, through materials that remain under the user’s control.

### 4.2 Time-Aware Self-Modeling

The self-model is treated as a revision-bearing object rather than a static profile. Observations are stored with:

- timestamp
- source or provenance
- confidence
- revision history
- promotion status

This design aims to reduce false permanence. The system does not ask, “Who is this person, once and for all?” It asks, “What currently seems true, based on what evidence, during what period, and with what degree of user confirmation?”

### 4.3 Confirmation of High-Impact Changes

Not all memory items should be promoted equally. The architecture distinguishes between lightweight candidate observations and high-impact self-model updates. High-impact updates are those likely to shape later decision support, such as:

- stable work preferences
- strong motivational priorities
- relationship boundaries
- recovery patterns
- triggers and avoidances

Such updates require explicit user confirmation before they become high-weight guidance inputs. This confirmation mechanism is central to the claim of user sovereignty.

### 4.4 Priors as Low-Authority Hypotheses

The prototype supports prior-generation modules based on systems such as MBTI and several culturally situated interpretive traditions. However, these are translated into grounded personality hypotheses rather than used as fate-predicting systems. Their role is only to improve cold start by helping the assistant ask better early questions.

This translation layer enforces three constraints:

1. priors must be phrased as tentative tendencies
2. priors must generate confirmatory or disconfirmatory questions
3. priors must yield to observed behavior and user correction

The design goal is to convert culturally familiar self-interpretation tools into low-weight interview scaffolds rather than authoritative identity engines.

### 4.5 Desire and Emotion as Reflective Interfaces

The system includes a seven-direction desire lens that visually presents hypotheses about current motivational balance and distortion. These directions include self-worth, security, intimacy, comparison, enjoyment, justice, and rest. They are not diagnostic categories. Instead, they provide a compact reflective surface through which the user can ask:

- what is driving me right now?
- where am I balanced?
- where am I being pulled into distortion?

This interface is intended to support self-awareness and decision reflection rather than behavioral scoring.

## 5. Prototype: xiaoxian AI

`xiaoxian AI` is an open-source macOS-first prototype that implements the architecture above. The current system includes:

- a local web application for daily conversation
- persistent local chat history
- structured candidate memory extraction from each turn
- confirmation flows for high-impact profile changes
- a seven-direction desire display
- local cognitive logs and training data generation
- a local fine-tuning pipeline for a smaller personal model
- a public project page and source code artifact for reproducibility

The system is intentionally designed around conversation-first intake. Instead of front-loading identity forms, it collects understanding through dialogue. Settings for model endpoints, local memory management, and training controls are separated from the main chat surface to preserve a companion-like user experience.

## 6. Design Rationale

### 6.1 Why not store everything only as external memory?

Pure externalization eventually creates a precision problem. As memory stores grow, retrieval quality, ranking, and interpretation become harder. The system may surface stale, weak, or contextually inappropriate information. More importantly, raw retrieval does not itself create a coherent user-specific interpretive lens.

Local fine-tuning offers a complementary path: instead of retrieving everything at runtime, the system can slowly distill recurring user-specific structure into a smaller model that becomes better at interpreting new material in that person’s own context.

### 6.2 Why not train everything directly into one central model?

Because the training material required for meaningful personal adaptation is precisely the material most users may not want to surrender to a platform: intimate conversations, emotional states, unfinished decisions, relational tensions, and long-term behavioral traces. Centralizing this material creates both privacy risks and asymmetry of power.

### 6.3 Why this split is socially meaningful

The proposed architecture reframes personal AI as a form of shared intelligence with differentiated ownership. General capability may be widely distributed through large shared models, while personal continuity remains locally accumulated and personally governed. This can support a more plural, less extractive AI ecosystem in which users build AI assets that remain meaningfully theirs.

## 7. Discussion

### 7.1 User sovereignty as a system property

In many AI discussions, “user control” is treated as a product setting. Here it is treated as an architectural property. A system is more user-sovereign when:

- personal history is locally held by default
- critical self-model changes are confirmable
- priors are demoted to hypotheses
- revision is first-class rather than exceptional

This shifts the personal assistant from being a black-box profiler to being a collaborative mirror.

### 7.2 Limitations

The current prototype does not yet establish longitudinal efficacy. Several important questions remain open:

- whether local fine-tuning improves practical personalization versus retrieval-only baselines
- how often stable self-model priors should update
- how to detect overfitting to short emotional periods
- how to evaluate “being understood” without reducing it to shallow satisfaction metrics
- how to govern multiple parallel self-models across life domains

The system is also not intended for clinical diagnosis, mental health treatment, or high-stakes professional decision automation.

### 7.3 Future Research

Future work should include:

- longitudinal user studies on trust and perceived self-understanding
- comparative experiments between retrieval-only, prompt-profile, and local-fine-tuned variants
- methods for temporally scoped model adaptation
- techniques for memory compression with better provenance retention
- governance models for user-owned agent ecosystems and, eventually, decentralized coordination across personal agents

## 8. Conclusion

Personal AI should not be framed only as a smarter chatbot. It should also be framed as infrastructure for personal continuity, self-understanding, and private adaptation. This paper argues for a user-sovereign architecture in which strong online models handle live interaction and tool orchestration, while smaller local models preserve and refine the user’s long-term personalized understanding through local organization and fine-tuning.

The open-source prototype `xiaoxian AI` serves as an initial practical instantiation of this thesis. We propose that this split architecture offers a promising path for a more human-centered and less extractive relationship between people and AI systems: one in which shared intelligence remains powerful, while personal understanding remains close to the person whose life generates it.

## References

1. Shneiderman, B. (2020). Bridging the gap between ethics and practice: guidelines for reliable, safe, and trustworthy human-centered AI systems. *ACM Transactions on Interactive Intelligent Systems*, 10(4), 1-31. https://doi.org/10.1145/3419764
2. McMahan, B., Moore, E., Ramage, D., Hampson, S., & y Arcas, B. A. (2017). Communication-efficient learning of deep networks from decentralized data. In *Proceedings of the 20th International Conference on Artificial Intelligence and Statistics* (pp. 1273-1282). PMLR. https://proceedings.mlr.press/v54/mcmahan17a.html
3. Schmager, S., Pappas, I. O., & Vassilakopoulou, P. (2025). Understanding human-centred AI: a review of its defining elements and a research agenda. *Behaviour & Information Technology*, 44(15), 1-40. https://doi.org/10.1080/0144929X.2024.2448719
4. Misra, S., Barik, K., & Kvalvik, P. (2025). A comprehensive review of human-centric AI, regulatory frameworks, and their role in shaping Industry 5.0. *Procedia Computer Science*, 255, 1060-1069. https://doi.org/10.1016/j.procs.2025.04.122
5. Karpathy, A. (2025). *autorresearch* [Software]. GitHub. https://github.com/karpathy/autoresearch
6. dentes9988. (2026). *xiaoxian AI* [Software]. GitHub. https://github.com/dentes9988/xiaoxian-ai

## Submission Note

This draft is currently strongest as a conceptual + design + open-source artifact paper. Before submitting to a systems-heavy venue, the manuscript would benefit from at least one empirical section comparing:

- retrieval-only personalization
- prompt-profile personalization
- local self-trained personalization

on measures such as relevance, user-correction burden, privacy boundary clarity, and perceived understanding.
